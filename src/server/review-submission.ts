import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * AI review for a practical submission.
 * Pluggable backend via env vars:
 *   VISION_PROVIDER = "lovable" (default) | "openai_compat"
 *   For openai_compat:
 *     EXTERNAL_VISION_URL    e.g. https://your-mac-studio.tailscale.net/v1
 *     EXTERNAL_VISION_KEY    optional bearer key
 *     EXTERNAL_VISION_MODEL  e.g. qwen2-vl:7b
 *
 * NOTE: video frame extraction in the Worker runtime is not feasible with ffmpeg.
 * For now we send the file URL + brief + rubric to the model and let it reason
 * over the lesson context. Full frame extraction will require a desktop tracker
 * or an external worker (Phase 3 / Mac Studio).
 */
export const reviewSubmission = createServerFn({ method: "POST" })
  .inputValidator((input: { submissionId: string }) => input)
  .handler(async ({ data }) => {
    const { submissionId } = data;

    // Load submission + lesson context
    const { data: sub, error: subErr } = await supabaseAdmin
      .from("submissions")
      .select("id, lesson_id, file_url, user_id")
      .eq("id", submissionId)
      .single();
    if (subErr || !sub) return { ok: false, error: "Submission not found" };

    const { data: lesson } = await supabaseAdmin
      .from("lessons")
      .select("title, content, section_id")
      .eq("id", sub.lesson_id)
      .single();

    const brief =
      (lesson?.content as { brief?: string } | null)?.brief ??
      "Review this practical submission against the lesson goals.";

    const provider = process.env.VISION_PROVIDER ?? "lovable";

    const rubric = {
      criteria: [
        { name: "Brief alignment", max: 20 },
        { name: "Technical correctness", max: 20 },
        { name: "Pacing & rhythm", max: 15 },
        { name: "Captions & text", max: 15 },
        { name: "Audio quality", max: 15 },
        { name: "Export & delivery", max: 15 },
      ],
    };

    const systemPrompt = `You are a senior video editor reviewing a student submission for the IRM Academy training program.
Score the submission across the rubric criteria. Be specific and actionable.
Return ONLY a JSON object: { "score": <0-100>, "rubric": { "<criterion>": <0-max> }, "comments": "<2-4 sentence feedback>" }.`;

    const userPrompt = `Lesson: ${lesson?.title ?? "Unknown"}
Brief: ${brief}
Submission file: ${sub.file_url}
Rubric: ${JSON.stringify(rubric)}

The video file is hosted at the URL above. Score it as best you can given the brief.
If you cannot access the video, score conservatively (50-65) and note this in comments.`;

    let result: { score: number; rubric: Record<string, number>; comments: string } | null = null;
    let model = "";
    let raw: unknown = null;

    try {
      if (provider === "openai_compat") {
        const baseUrl = process.env.EXTERNAL_VISION_URL;
        const key = process.env.EXTERNAL_VISION_KEY ?? "";
        model = process.env.EXTERNAL_VISION_MODEL ?? "qwen2-vl";
        if (!baseUrl) throw new Error("EXTERNAL_VISION_URL not set");
        const resp = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(key ? { Authorization: `Bearer ${key}` } : {}),
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
            response_format: { type: "json_object" },
          }),
        });
        if (!resp.ok) throw new Error(`External vision ${resp.status}`);
        raw = await resp.json();
        const content = (raw as { choices?: { message?: { content?: string } }[] })?.choices?.[0]
          ?.message?.content;
        if (content) result = JSON.parse(content);
      } else {
        // Lovable AI Gateway
        model = "google/gemini-2.5-pro";
        const key = process.env.LOVABLE_API_KEY;
        if (!key) throw new Error("LOVABLE_API_KEY not set");
        const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
            tools: [
              {
                type: "function",
                function: {
                  name: "submit_review",
                  description: "Return the structured review",
                  parameters: {
                    type: "object",
                    properties: {
                      score: { type: "number", minimum: 0, maximum: 100 },
                      rubric: {
                        type: "object",
                        additionalProperties: { type: "number" },
                      },
                      comments: { type: "string" },
                    },
                    required: ["score", "rubric", "comments"],
                  },
                },
              },
            ],
            tool_choice: { type: "function", function: { name: "submit_review" } },
          }),
        });
        if (resp.status === 429)
          return { ok: false, error: "AI rate limit — please wait a moment and retry." };
        if (resp.status === 402)
          return { ok: false, error: "AI credits exhausted — top up at Settings → Workspace → Usage." };
        if (!resp.ok) {
          const t = await resp.text();
          throw new Error(`Lovable AI ${resp.status}: ${t.slice(0, 200)}`);
        }
        raw = await resp.json();
        const toolCall = (raw as {
          choices?: { message?: { tool_calls?: { function?: { arguments?: string } }[] } }[];
        })?.choices?.[0]?.message?.tool_calls?.[0];
        const args = toolCall?.function?.arguments;
        if (args) result = JSON.parse(args);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      console.error("AI review failed:", msg);
      return { ok: false, error: msg };
    }

    if (!result) return { ok: false, error: "AI returned no structured output" };

    const insertPayload = {
      submission_id: submissionId,
      provider,
      model,
      score: Math.round(result.score),
      rubric: result.rubric as Record<string, number>,
      comments: result.comments,
      frames_analyzed: 0,
      raw_response: raw as Record<string, unknown>,
    };
    const { error: insErr, data: inserted } = await supabaseAdmin
      .from("ai_reviews")
      .insert(insertPayload)
      .select("id")
      .single();

    if (insErr) return { ok: false, error: insErr.message };

    return {
      ok: true,
      reviewId: inserted.id,
      score: result.score,
      comments: result.comments,
      rubric: result.rubric,
      provider,
      model,
    };
  });

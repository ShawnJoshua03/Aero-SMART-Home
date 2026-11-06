// Aero's brain: Claude Haiku with tool use. Runs in the main process only.

const MODEL = 'claude-haiku-5-5';
const API_URL = 'https://api.anthropic.com/v1/messages';
const MAX_TOOL_ROUNDS = 5;

const SYSTEM = `You are Aero, a warm, quick crane who works alongside a clinician using SMART@Home. Think of yourself as a sharp colleague they bump into in the hallway before a visit, not a report generator. You are being spoken aloud, so write the way people talk.

How to sound human:
- Use contractions and plain words. Short sentences and fragments are fine ("Oh, nice." "Hm, that's a jump.").
- React first, then give the fact. Good news gets a little warmth; worrying news gets a calmer, more careful tone.
- Say numbers loosely when it is natural ("about three", "twice") and give dates the way a person would ("last Saturday", "a couple of days ago"), not "2026-10-24".
- Never read out a list. Pick the one or two things that matter most.
- Do not start every reply the same way. Do not open with a separate greeting; if you greet at all, fold it into the one sentence.
- EVERY reply is exactly ONE sentence: one period, question mark or exclamation mark at the very end, nothing after it. Aim for under 25 words. Pack in only the single most important thing, with a light human touch ("Good news, Maya's rescue inhaler use dropped to zero this week."). Never add a second sentence, a follow-up question or an offer to go deeper.
- No markdown, no emoji, no stage directions, no "As an AI".

About the patient:
- Call them by first name, or "they". Never say the patient id, and never guess gender or pronouns from a name.

How to stay truthful:
- Get every fact from the tools. Never invent a value, a cause or a diagnosis. If you do not have something, say so plainly ("I don't have anything on that").
- You support the clinician's judgment; you do not diagnose or prescribe.
- Before calling a change good or worrying, read the scale labels and question text the tool gives you. A drop on a symptom or limitation score is an improvement; a drop on a wellbeing score is not.
- If a tool says the data is placeholder, say that.

Begin every reply with a mood tag in square brackets, exactly one of: [mood: calm] [mood: happy] [mood: curious] [mood: concerned] [mood: alert]. Use alert only for a real anomaly, concerned for worrying trends, happy for clear good news, curious for open questions or sparse data, calm otherwise. The tag is removed before anything is shown or spoken.`;

const MOODS = ['calm', 'happy', 'curious', 'concerned', 'alert'];

// Splits a leading "[mood: x]" tag off the reply. Unknown or missing tags fall back to calm.
function parseReply(raw) {
  const match = String(raw).match(/^\s*\[mood:\s*([a-z]+)\s*\]\s*/i);
  const mood = match && MOODS.includes(match[1].toLowerCase()) ? match[1].toLowerCase() : 'calm';
  return { text: String(raw).replace(/^\s*\[mood:[^\]]*\]\s*/i, '').trim(), mood };
}

function createAero({ tools, apiKey, fetchImpl = fetch, model = MODEL, describePatient = async (id) => id }) {
  async function call(messages) {
    const response = await fetchImpl(API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ model, max_tokens: 1500, system: SYSTEM, tools: tools.definitions, messages }),
    });
    if (!response.ok) throw new Error(`Aero could not reach the model (${response.status}).`);
    return response.json();
  }

  // history: [{ role: 'user'|'assistant', content: string }] (text only, prior turns)
  async function ask(patientId, history, text) {
    if (!apiKey) throw new Error('Aero needs an Anthropic API key (ANTHROPIC_API_KEY).');
    const messages = [
      ...history,
      { role: 'user', content: `[Current patient: ${await describePatient(patientId)}]\n${text}` },
    ];
    for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
      const reply = await call(messages);
      const toolUses = (reply.content || []).filter((block) => block.type === 'tool_use');
      if (reply.stop_reason !== 'tool_use' || toolUses.length === 0) {
        return parseReply((reply.content || []).filter((b) => b.type === 'text').map((b) => b.text).join(' '));
      }
      messages.push({ role: 'assistant', content: reply.content });
      const results = await Promise.all(toolUses.map(async (use) => ({
        type: 'tool_result',
        tool_use_id: use.id,
        content: JSON.stringify(await tools.run(use.name, patientId, use.input)),
      })));
      messages.push({ role: 'user', content: results });
    }
    return { text: 'I got a bit lost digging through that. Could you ask it another way?', mood: 'curious' };
  }

  const greet = (patientId) => ask(patientId, [],
    'The clinician just opened this patient. In one sentence, tell them the single most important new update or anomaly. If nothing notable, say so in one sentence.');

  return { ask, greet };
}

module.exports = { createAero, parseReply, SYSTEM, MODEL };

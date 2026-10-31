import type { Lang } from '../domain/types'

/** Sathi's lines. `text` is shown on screen (romanised for Hindi, matching the approved design); `say` is spoken. */
export interface Line { text: string; say: string }
type Cat = (v: Record<string, string>) => Line
const L = (text: string, say = text): Line => ({ text, say })

const hi = {
  greet: (v: Record<string, string>) => L(`Namaste, ${v.name}. Aapki dawa ka time ho gaya hai. Kya aapne ${v.med} le li?`, `नमस्ते, ${v.name}. आपकी दवा का समय हो गया है। क्या आपने ${v.med} ले ली?`),
  hello: (v: Record<string, string>) => L(`Namaste, ${v.name}. Main Sathi hoon, ek AI saathi. Bataiye, main kya madad karun?`, `नमस्ते, ${v.name}. मैं साथी हूँ, एक एआई साथी। बताइए, मैं क्या मदद करूँ?`),
  taken: () => L('Achha, main note kar leta hoon ki aapne dawa le li hai. Dhanyavaad.', 'अच्छा, मैं नोट कर लेता हूँ कि आपने दवा ले ली है। धन्यवाद।'),
  notYet: () => L('Theek hai. Kitni der baad yaad dilau — 5, 10 ya 15 minute?', 'ठीक है। कितनी देर बाद याद दिलाऊँ — 5, 10 या 15 मिनट?'),
  snoozed: (v: Record<string, string>) => L(`Theek hai, ${v.min} minute baad phir yaad dilaunga.`, `ठीक है, ${v.min} मिनट बाद फिर याद दिलाऊँगा।`),
  rescheduled: (v: Record<string, string>) => L(`Theek hai, reminder ${v.when} ke liye badal diya.`, `ठीक है, रिमाइंडर ${v.when} के लिए बदल दिया।`),
  created: (v: Record<string, string>) => L(`Theek hai, "${v.title}" ka reminder ${v.when} ke liye set kar diya.`, `ठीक है, "${v.title}" का रिमाइंडर ${v.when} के लिए सेट कर दिया।`),
  duplicate: (v: Record<string, string>) => L(`Ye reminder pehle se set hai — ${v.when}.`, `यह रिमाइंडर पहले से सेट है — ${v.when}।`),
  cancelled: () => L('Reminder cancel kar diya.', 'रिमाइंडर रद्द कर दिया।'),
  noneActive: () => L('Abhi koi reminder nahi baj raha. Kaunsa reminder?', 'अभी कोई रिमाइंडर नहीं बज रहा। कौन सा रिमाइंडर?'),
  listEmpty: () => L('Aapka koi upcoming reminder nahi hai.', 'आपका कोई आने वाला रिमाइंडर नहीं है।'),
  listIntro: (v: Record<string, string>) => L(`Aapke ${v.n} reminder hain: ${v.items}.`, `आपके ${v.n} रिमाइंडर हैं: ${v.items}।`),
  healthAsk: (v: Record<string, string>) => L(`${v.what} record karun? "Haan" ya "Nahi" boliye.`, `${v.what} रिकॉर्ड करूँ? "हाँ" या "नहीं" बोलिए।`),
  healthSaved: () => L('Reading save kar li.', 'रीडिंग सेव कर ली।'),
  healthDiscard: () => L('Theek hai, reading save nahi ki.', 'ठीक है, रीडिंग सेव नहीं की।'),
  healthBad: (v: Record<string, string>) => L(`Ye reading sahi nahi lag rahi: ${v.why} Dobara bataiye.`, `यह रीडिंग सही नहीं लग रही: ${v.why} दोबारा बताइए।`),
  unknown: () => L('Maaf kijiye, samajh nahi aaya. Aap type karke bhi bata sakte hain.', 'माफ़ कीजिए, समझ नहीं आया। आप टाइप करके भी बता सकते हैं।'),
  noSpeech: () => L('Mujhe kuch sunai nahi diya. Dobara boliye ya type kijiye.', 'मुझे कुछ सुनाई नहीं दिया। दोबारा बोलिए या टाइप कीजिए।'),
  bye: () => L('Theek hai. Phir milte hain.', 'ठीक है। फिर मिलते हैं।'),
} satisfies Record<string, Cat>

const en: typeof hi = {
  greet: (v) => L(`Hello, ${v.name}. It's time for your medicine. Did you take your ${v.med}?`),
  hello: (v) => L(`Hello, ${v.name}. I'm Sathi, an AI companion. How can I help?`),
  taken: () => L("Good, I've noted that you took your medicine. Thank you."),
  notYet: () => L('Okay. Remind you again in 5, 10 or 15 minutes?'),
  snoozed: (v) => L(`Okay, I'll remind you again in ${v.min} minutes.`),
  rescheduled: (v) => L(`Okay, I moved the reminder to ${v.when}.`),
  created: (v) => L(`Okay, I set a reminder for "${v.title}" ${v.when}.`),
  duplicate: (v) => L(`That reminder is already set — ${v.when}.`),
  cancelled: () => L('I cancelled that reminder.'),
  noneActive: () => L('No reminder is ringing right now. Which reminder do you mean?'),
  listEmpty: () => L('You have no upcoming reminders.'),
  listIntro: (v) => L(`You have ${v.n} reminders: ${v.items}.`),
  healthAsk: (v) => L(`Shall I record ${v.what}? Say "yes" or "no".`),
  healthSaved: () => L('I saved the reading.'),
  healthDiscard: () => L("Okay, I didn't save the reading."),
  healthBad: (v) => L(`That reading doesn't look right: ${v.why} Please tell me again.`),
  unknown: () => L("Sorry, I didn't understand. You can also type it."),
  noSpeech: () => L("I didn't hear anything. Please try again or type."),
  bye: () => L('Okay. Talk soon.'),
}

export type MsgKey = keyof typeof hi
/** Marathi and Kannada fall back to Hindi/English wording: Sathi's replies are not translated into them yet. */
export function msg(lang: Lang, key: MsgKey, vars: Record<string, string> = {}): Line {
  return (lang === 'en' ? en : lang === 'hi' ? hi : en)[key](vars)
}
export const supportsReplies = (lang: Lang) => lang === 'hi' || lang === 'en'

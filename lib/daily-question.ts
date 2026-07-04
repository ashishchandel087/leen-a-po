// Question of the day — shared helpers.
//
// The prompt for a date is chosen deterministically (days-since-epoch mod
// list length), so every server instance agrees on today's question without
// coordination, consecutive days never repeat, and the whole list plays out
// before it cycles.

// All user-facing dates in this app are Asia/Kolkata (see fmt() in the
// dashboard). Scheduled pushes and "today's" question use the same clock so
// the question flips over at midnight IST, not midnight UTC.
export const APP_TZ = process.env.APP_TZ || "Asia/Kolkata";

/** Today's date as YYYY-MM-DD in the app timezone. */
export function appToday(): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: APP_TZ }).format(new Date());
}

/** Whole days from a YYYY-MM-DD to another (positive when `to` is later). */
export function daysBetween(from: string, to: string): number {
  return Math.round(
    (new Date(to + "T12:00:00Z").getTime() - new Date(from + "T12:00:00Z").getTime()) / 86400000
  );
}

export function promptForDate(date: string): string {
  const day = Math.floor(new Date(date + "T12:00:00Z").getTime() / 86400000);
  return QUESTIONS[((day % QUESTIONS.length) + QUESTIONS.length) % QUESTIONS.length];
}

export const MAX_ANSWER_LENGTH = 1000;

const QUESTIONS: string[] = [
  "What was your first impression of me — and when did it change?",
  "If we could teleport anywhere for the next 24 hours, where are we going?",
  "What's a tiny thing I do that makes you feel loved?",
  "Which song will always remind you of us?",
  "What's a meal we should learn to cook together?",
  "What do you think I'm secretly really good at?",
  "If our love story were a movie, what would its title be?",
  "What's one adventure you want us to have before we're old?",
  "What did you almost not tell me when we first started talking?",
  "What's your favourite photo of us, and why that one?",
  "If I could read your mind for one minute today, what would I find?",
  "What's something you want us to argue about less?",
  "Which of my habits do you find weirdly adorable?",
  "What's a dream you've never said out loud?",
  "Where do you see us on this exact date, five years from now?",
  "What's the best gift I've ever given you — not counting things money can buy?",
  "If we opened a tiny shop together, what would we sell?",
  "What smell instantly reminds you of me?",
  "What's one thing you were scared to ask me but aren't anymore?",
  "Which fictional couple are we most like?",
  "What's a compliment you've been meaning to give me?",
  "If today were our first date all over again, where would you take me?",
  "What's the hardest thing you've ever told me — and are you glad you did?",
  "What would our pet's name be, and what animal is it?",
  "What do I do when I think nobody's watching that makes you smile?",
  "What's one promise you want us to make to each other today?",
  "Which memory of us do you replay the most?",
  "If we swapped phones for a day, what would surprise me?",
  "What's something new you want to try together this month?",
  "When did you last miss me, and what triggered it?",
  "What's the most 'us' thing that has ever happened?",
  "If you could relive one of our days exactly as it was, which one?",
  "What's a fear of yours that has gotten smaller since we met?",
  "What would you want us to be famous for?",
  "What's the silliest thing you've done to get my attention?",
  "Which of our inside jokes would be hardest to explain to anyone else?",
  "What's one way I've changed you for the better?",
  "If we had a whole rainy day and nowhere to be, how do we spend it?",
  "What's a question you wish I asked you more often?",
  "What tiny detail about me did you notice before anything else?",
  "What's the best advice about love you've ever gotten — and do we follow it?",
  "If our future house could have one totally impractical feature, what is it?",
  "What's something I taught you without meaning to?",
  "Which city in the world feels like it was made for us?",
  "What's the last thing I did that made you laugh when you were alone?",
  "What would your 15-year-old self think of us?",
  "What's one thing you want me to never stop doing?",
  "If we wrote a book together, what would it be about?",
  "What's your favourite way I say your name?",
  "What's a small sacrifice I've made that you never mentioned noticing?",
  "If tomorrow was a surprise day off for both of us, what's the plan?",
  "What food will you always associate with a memory of us?",
  "What's one thing about our relationship you'd never trade for anything?",
  "When do I look most at peace to you?",
  "What's a tradition you want us to start this year?",
  "If you could bottle one feeling from our early days, which one?",
  "What's something you admire about how I handle hard days?",
  "What would we name our boat, if we ever had one?",
  "What's the most spontaneous thing we've ever done together?",
  "What's one thing you hope never changes about how we talk to each other?",
  "If I disappeared for a day, what's the first thing you'd miss?",
  "What's a moment you were proudest to be mine?",
  "Which of my dreams do you secretly root for the hardest?",
  "What's the weirdest thing we do that feels completely normal now?",
  "If we could invite any three people (alive or not) to dinner, who's coming?",
  "What's one thing you'd tell the version of me you first met?",
  "What does home feel like to you when we're together?",
  "What's the pettiest thing you've ever been annoyed at me about?",
  "If our love had a colour, what would it be today?",
  "What's a skill you want to learn just so we can do it together?",
  "What part of our story would you tell our grandkids first?",
  "What's one worry I could take off your plate this week?",
  "When was the last time I surprised you — really surprised you?",
  "What's your favourite ordinary moment with me?",
  "If we made a time capsule today, what three things go in it?",
  "What's something you love that you wish I loved too?",
  "How do you know when I'm about to say sorry?",
  "What's the first thing you'd do if we won a stupid amount of money?",
  "What's one way we're a better team this year than last year?",
  "If you had to describe me in three words to a stranger, which three?",
  "What's a place we've been that you'd love to see again in a different season?",
  "What made you certain about us?",
];

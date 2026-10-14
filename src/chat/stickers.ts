/*
 * Stickers and emoji for the chat composer.
 *
 * Sticker art: Microsoft Fluent Emoji (3D), MIT licence — see
 * public/stickers/LICENSE.txt. Each sticker is a 256 px WebP in public/stickers,
 * shipped with the app; a sticker message carries just its id.
 */

import { readJson, storageKey, type KeyValueStore } from '../lib/storage';

export interface Sticker {
  id: string;
  label: string;
}

export const STICKERS: Sticker[] = (
  [
  ['face-with-tears-of-joy', 'Face with tears of joy'],
  ['rolling-on-the-floor-laughing', 'Rolling on the floor laughing'],
  ['grinning-face', 'Grinning face'],
  ['beaming-face-with-smiling-eyes', 'Beaming face with smiling eyes'],
  ['smiling-face-with-heart-eyes', 'Smiling face with heart eyes'],
  ['smiling-face-with-hearts', 'Smiling face with hearts'],
  ['face-blowing-a-kiss', 'Face blowing a kiss'],
  ['winking-face', 'Winking face'],
  ['smiling-face-with-sunglasses', 'Smiling face with sunglasses'],
  ['star-struck', 'Star struck'],
  ['partying-face', 'Partying face'],
  ['hugging-face', 'Hugging face'],
  ['thinking-face', 'Thinking face'],
  ['face-with-hand-over-mouth', 'Face with hand over mouth'],
  ['shushing-face', 'Shushing face'],
  ['face-with-rolling-eyes', 'Face with rolling eyes'],
  ['grimacing-face', 'Grimacing face'],
  ['upside-down-face', 'Upside down face'],
  ['melting-face', 'Melting face'],
  ['zany-face', 'Zany face'],
  ['nerd-face', 'Nerd face'],
  ['smiling-face-with-halo', 'Smiling face with halo'],
  ['relieved-face', 'Relieved face'],
  ['pleading-face', 'Pleading face'],
  ['face-holding-back-tears', 'Face holding back tears'],
  ['crying-face', 'Crying face'],
  ['loudly-crying-face', 'Loudly crying face'],
  ['angry-face', 'Angry face'],
  ['exploding-head', 'Exploding head'],
  ['flushed-face', 'Flushed face'],
  ['sleeping-face', 'Sleeping face'],
  ['yawning-face', 'Yawning face'],
  ['saluting-face', 'Saluting face'],
  ['face-with-monocle', 'Face with monocle'],
  ['neutral-face', 'Neutral face'],
  ['red-heart', 'Red heart'],
  ['sparkling-heart', 'Sparkling heart'],
  ['broken-heart', 'Broken heart'],
  ['fire', 'Fire'],
  ['hundred-points', 'Hundred points'],
  ['sparkles', 'Sparkles'],
  ['party-popper', 'Party popper'],
  ['birthday-cake', 'Birthday cake'],
  ['wrapped-gift', 'Wrapped gift'],
  ['rocket', 'Rocket'],
  ['glowing-star', 'Glowing star'],
  ['rainbow', 'Rainbow'],
  ['hot-beverage', 'Hot beverage'],
  ['pizza', 'Pizza'],
  ['ghost', 'Ghost'],
  ['unicorn', 'Unicorn'],
  ['dog-face', 'Dog face'],
  ['cat-with-tears-of-joy', 'Cat with tears of joy'],
  ['thumbs-up', 'Thumbs up'],
  ['clapping-hands', 'Clapping hands'],
  ['folded-hands', 'Folded hands'],
  ['waving-hand', 'Waving hand'],
  ['victory-hand', 'Victory hand'],
  ['raising-hands', 'Raising hands'],
  ['flexed-biceps', 'Flexed biceps'],
  ['call-me-hand', 'Call me hand'],
  ] as const
).map(([id, label]) => ({ id, label }));

const BY_ID = new Map(STICKERS.map((s) => [s.id, s]));

export const stickerUrl = (id: string) => `/stickers/${id}.webp`;
/** Known sticker, or undefined (e.g. sent from a newer version of the app). */
export const findSticker = (id: string) => BY_ID.get(id);

const RECENT_KEY = storageKey('recentStickers');
const RECENT_MAX = 16;

/** Stickers this browser sent recently, newest first. */
export function recentStickers(store: KeyValueStore): Sticker[] {
  const ids = readJson<string[]>(store, RECENT_KEY) ?? [];
  return ids.map((id) => BY_ID.get(id)).filter((s): s is Sticker => !!s);
}

export function rememberSticker(store: KeyValueStore, id: string): void {
  const ids = (readJson<string[]>(store, RECENT_KEY) ?? []).filter((x) => x !== id);
  store.setItem(RECENT_KEY, JSON.stringify([id, ...ids].slice(0, RECENT_MAX)));
}

/** Older symbols (❤, ✌) need U+FE0F to show as colour emoji rather than text. */
const asEmoji = (e: string) => (e.length === 1 && e.codePointAt(0)! < 0x1f000 ? `${e}\ufe0f` : e);

/** Emoji for the picker, by group (text, inserted where the cursor is). */
export const EMOJI_GROUPS: { label: string; emoji: string[] }[] = (
  [
  {
    label: 'Smileys',
    emoji: [...'😀😃😄😁😆😅🤣😂🙂🙃🫠😉😊😇🥰😍🤩😘😗😚😙🥲😋😛😜🤪😝🤑🤗🤭🫢🤫🤔🫡🤐🤨😐😑😶🫥😏😒🙄😬😮‍💨🤥😌😔😪🤤😴😷🤒🤕🤢🤮🤧🥵🥶🥴😵🤯🤠🥳🥸😎🤓🧐😕🫤😟🙁😮😯😲😳🥺🥹😦😧😨😰😥😢😭😱😖😣😞😓😩😫🥱😤😡😠🤬😈👿💀💩🤡👻👽🤖'.match(/\p{Extended_Pictographic}(\u200d\p{Extended_Pictographic}|\ufe0f)*/gu)!],
  },
  {
    label: 'Gestures',
    emoji: [...'👋🤚🖐✋🖖👌🤌🤏✌🤞🫰🤟🤘🤙👈👉👆👇☝🫵👍👎✊👊🤛🤜👏🙌🫶👐🤲🤝🙏✍💪🦾🙇🤦🤷'.match(/\p{Extended_Pictographic}/gu)!],
  },
  {
    label: 'Hearts',
    emoji: [...'❤🧡💛💚💙💜🤎🖤🤍💔❣💕💞💓💗💖💘💝💟💯💢💥💫💦💨🕳💬💭💤'.match(/\p{Extended_Pictographic}/gu)!],
  },
  {
    label: 'Things',
    emoji: [...'🎉🎊🎈🎁🎂🍰☕🍵🍕🍔🍟🌮🍿🍫🍩🍪🍎🍉🍓🍌⚽🏏🏆🎮🎵🎶📷📱💻⌚💡📌📎✏📚💰💸✈🚗🏠⏰🌙⭐🌟✨☀🌈🔥💧🌹🌸🌻🍀🐶🐱🦋'.match(/\p{Extended_Pictographic}/gu)!],
  },
  ] as { label: string; emoji: string[] }[]
).map((g) => ({ ...g, emoji: g.emoji.map(asEmoji) }));

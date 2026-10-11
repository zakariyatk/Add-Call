import type { CallRecord, Contact } from './types';

/** Placeholder address book until a contacts backend exists. */
export const SAMPLE_CONTACTS: Contact[] = [
  { id: 'c1', name: 'Aisha Khan', number: '+919876543210', favorite: true },
  { id: 'c2', name: 'Arjun Mehta', number: '+919812345678' },
  { id: 'c3', name: 'Daniel Brooks', number: '+14155550132', favorite: true },
  { id: 'c4', name: 'Fatima Noor', number: '+919845012345' },
  { id: 'c5', name: 'Kiran Rao', number: '+919900112233' },
  { id: 'c6', name: 'Maya Fernandes', number: '+919988776655', favorite: true },
  { id: 'c7', name: 'Rahul Verma', number: '+919123456780' },
  { id: 'c8', name: 'Sophie Laurent', number: '+14155550178' },
  { id: 'c9', name: 'Zaid Hussain', number: '+919765432101' },
];

/** A plausible recent-calls history relative to `now`. */
export function sampleRecents(now: number): CallRecord[] {
  const min = 60_000;
  const c = (i: number) => SAMPLE_CONTACTS[i];
  return [
    { id: 'r1', name: c(0).name, number: c(0).number, direction: 'incoming', at: now - 12 * min, duration: 384, video: false },
    { id: 'r2', name: c(2).name, number: c(2).number, direction: 'outgoing', at: now - 95 * min, duration: 1260, video: true },
    { id: 'r3', name: null, number: '+918045671234', direction: 'missed', at: now - 3 * 60 * min, duration: 0, video: false },
    { id: 'r4', name: c(5).name, number: c(5).number, direction: 'outgoing', at: now - 26 * 60 * min, duration: 75, video: false },
    { id: 'r5', name: c(3).name, number: c(3).number, direction: 'missed', at: now - 30 * 60 * min, duration: 0, video: false },
    { id: 'r6', name: c(1).name, number: c(1).number, direction: 'incoming', at: now - 4 * 24 * 60 * min, duration: 642, video: false },
    { id: 'r7', name: c(7).name, number: c(7).number, direction: 'outgoing', at: now - 9 * 24 * 60 * min, duration: 2105, video: true },
  ];
}

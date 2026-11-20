import { test } from "node:test";
import assert from "node:assert/strict";
import { session } from "../lib/marketHours";

// New York is UTC-5 in November (EST) and UTC-4 in summer (EDT)
const at = (iso: string) => session(new Date(iso));

test("regular, extended and overnight on a weekday", () => {
  assert.equal(at("2026-11-17T15:00:00Z"), "regular"); // Tue 10:00 NY
  assert.equal(at("2026-11-17T13:00:00Z"), "extended"); // Tue 08:00
  assert.equal(at("2026-11-17T22:00:00Z"), "extended"); // Tue 17:00
  assert.equal(at("2026-11-18T02:00:00Z"), "overnight"); // Tue 21:00
  assert.equal(at("2026-11-18T10:00:00Z"), "overnight"); // Wed 05:00
});

test("weekend: closed from Friday 20:00 to Sunday 20:00", () => {
  assert.equal(at("2026-11-21T02:00:00Z"), "closed"); // Fri 21:00
  assert.equal(at("2026-11-21T17:00:00Z"), "closed"); // Sat 12:00
  assert.equal(at("2026-11-22T23:00:00Z"), "closed"); // Sun 18:00
  assert.equal(at("2026-11-23T02:00:00Z"), "overnight"); // Sun 21:00
});

test("holidays and early closes", () => {
  assert.equal(at("2026-11-26T16:00:00Z"), "closed"); // Thanksgiving 11:00
  assert.equal(at("2026-11-26T02:00:00Z"), "closed"); // Wed 21:00, before Thanksgiving
  assert.equal(at("2026-11-27T17:00:00Z"), "regular"); // Fri 12:00, early close day
  assert.equal(at("2026-11-27T19:00:00Z"), "closed"); // Fri 14:00, after the 13:00 close
});

test("summer time", () => {
  assert.equal(at("2027-06-15T13:45:00Z"), "regular"); // Tue 09:45 EDT
  assert.equal(at("2027-06-15T13:15:00Z"), "extended"); // Tue 09:15 EDT
});

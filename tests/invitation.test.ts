import { test } from "node:test";
import assert from "node:assert/strict";
import {
  invitationLink,
  invitationToken,
} from "../src/features/family/invitation";
const token = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
test("invitación en enlace local con token en fragmento", () => {
  const link = invitationLink("https://clara.example", token);
  assert.equal(link, `https://clara.example/unirse#${token}`);
  assert.equal(invitationToken(link, "https://clara.example"), token);
  assert.equal(new URL(link).search, "");
});
test("rechaza enlaces ajenos, rutas incorrectas y tokens malformados", () => {
  for (const link of [
    `https://otro.example/unirse#${token}`,
    `https://clara.example/panel#${token}`,
    "javascript:alert(1)",
    "https://clara.example/unirse#malformado",
    "texto",
  ])
    assert.equal(invitationToken(link, "https://clara.example"), null);
  assert.throws(() => invitationLink("https://clara.example", "malformado"));
});

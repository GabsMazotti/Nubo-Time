// Testes do normalizador de telefone.  Rode com:  deno test
import { assertEquals } from "jsr:@std/assert@1";
import { normalizePhone } from "./phone.ts";

Deno.test("string com espaco (exemplo do briefing)", () => {
  assertEquals(normalizePhone("55 83988808063").phone, "5583988808063");
});

Deno.test("string formatada com + ( ) -", () => {
  assertEquals(normalizePhone("+55 (83) 98880-8063").phone, "5583988808063");
});

Deno.test("numero local brasileiro (11 digitos) ganha DDI 55", () => {
  assertEquals(normalizePhone("83988808063").phone, "5583988808063");
});

Deno.test("objeto {number}", () => {
  assertEquals(normalizePhone({ number: "5583988808063" }).phone, "5583988808063");
});

Deno.test("objeto {phone}", () => {
  assertEquals(normalizePhone({ phone: "5583988808063" }).phone, "5583988808063");
});

Deno.test("objeto {whatsapp}", () => {
  assertEquals(normalizePhone({ whatsapp: "5583988808063" }).phone, "5583988808063");
});

Deno.test("objeto {value}", () => {
  assertEquals(normalizePhone({ value: "5583988808063" }).phone, "5583988808063");
});

Deno.test("objeto {raw}", () => {
  assertEquals(normalizePhone({ raw: "55 83988808063" }).phone, "5583988808063");
});

Deno.test("array de objetos [{value}]", () => {
  assertEquals(normalizePhone([{ value: "5583988808063" }]).phone, "5583988808063");
});

Deno.test("numero como number", () => {
  assertEquals(normalizePhone(5583988808063).phone, "5583988808063");
});

Deno.test("[object Object] literal -> invalido (nunca enviar)", () => {
  const r = normalizePhone("[object Object]");
  assertEquals(r.ok, false);
  assertEquals(r.phone, null);
});

Deno.test("vazio / nulo -> invalido", () => {
  assertEquals(normalizePhone(null).ok, false);
  assertEquals(normalizePhone("").ok, false);
  assertEquals(normalizePhone({}).ok, false);
});

Deno.test("lixo curto -> invalido", () => {
  assertEquals(normalizePhone("123").ok, false);
});

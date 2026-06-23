// Máquina de criativos: gera imagens por prompt (OpenAI gpt-image-1 / Gemini) e edita/troca logo (Gemini).
// Cadastro de clientes (nome + logo). Resultados/logos vão pro Storage e viram galeria. Protegida por ?key=PANEL_KEY.
import { admin } from "../_shared/db.ts";
import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";

const BUCKET = "creatives";
const LOGOS = "client-logos";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
function jsonR(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
function sizeFromFormat(f?: string): string {
  if (f === "16:9") return "1536x1024";
  if (f === "9:16" || f === "4:5") return "1024x1536";
  return "1024x1024";
}
function stripDataUrl(s: string): string {
  const i = s.indexOf("base64,");
  return i >= 0 ? s.slice(i + 7) : s;
}

async function openaiImage(prompt: string, size: string, quality: string): Promise<string> {
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) throw new Error("OPENAI_API_KEY não configurada");
  const model = Deno.env.get("OPENAI_IMAGE_MODEL") ?? "gpt-image-1";
  const q = ["low", "medium", "high"].includes(quality) ? quality : "low"; // padrão BARATO
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, prompt, size, quality: q, n: 1 }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const b64 = data.data?.[0]?.b64_json;
  if (!b64) throw new Error("OpenAI não retornou imagem");
  return b64;
}
async function geminiImage(parts: unknown[]): Promise<string> {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) throw new Error("GEMINI_API_KEY não configurada");
  const model = Deno.env.get("GEMINI_IMAGE_MODEL") ?? "gemini-2.5-flash-image";
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ parts }] }) },
  );
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const out = data.candidates?.[0]?.content?.parts ?? [];
  for (const p of out) {
    const inl = p.inlineData ?? p.inline_data;
    if (inl?.data) return inl.data as string;
  }
  throw new Error("Gemini não retornou imagem (pode ter sido bloqueado por política de conteúdo)");
}

function b64ToU8(b64: string): Uint8Array { return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)); }
function u8ToB64(u8: Uint8Array): string {
  let s = ""; const chunk = 0x8000;
  for (let i = 0; i < u8.length; i += chunk) s += String.fromCharCode(...u8.subarray(i, i + chunk));
  return btoa(s);
}

// Estampa a logo (PNG) por cima da arte gerada, na posição pedida. Falha-segura: devolve a base se der erro.
async function overlayLogo(baseB64: string, logoB64: string, pos: string): Promise<string> {
  try {
    const base = await Image.decode(b64ToU8(baseB64)) as Image;
    const logo = await Image.decode(b64ToU8(logoB64)) as Image;
    const targetW = Math.max(48, Math.round(base.width * 0.22));
    const scaled = logo.resize(targetW, Image.RESIZE_AUTO);
    const pad = Math.round(base.width * 0.04);
    const right = base.width - scaled.width - pad;
    const bottom = base.height - scaled.height - pad;
    const cx = Math.round((base.width - scaled.width) / 2);
    let x = right, y = pad;
    if (pos === "top-left") { x = pad; y = pad; }
    else if (pos === "top-center") { x = cx; y = pad; }
    else if (pos === "bottom-left") { x = pad; y = bottom; }
    else if (pos === "bottom-right") { x = right; y = bottom; }
    else if (pos === "bottom-center") { x = cx; y = bottom; }
    base.composite(scaled, Math.max(0, x), Math.max(0, y));
    return u8ToB64(await base.encode());
  } catch (_e) {
    return baseB64;
  }
}

async function ensureBucket(db: ReturnType<typeof admin>, bucket: string) {
  await db.storage.createBucket(bucket, { public: true }).catch(() => {});
}
async function uploadB64(db: ReturnType<typeof admin>, b64: string, bucket: string): Promise<string> {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;
  const { error } = await db.storage.from(bucket).upload(name, bytes, { contentType: "image/png", upsert: false });
  if (error) throw new Error(`Storage: ${error.message}`);
  return db.storage.from(bucket).getPublicUrl(name).data.publicUrl;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = new URL(req.url);
  const PANEL_KEY = Deno.env.get("PANEL_KEY");
  if (!PANEL_KEY || url.searchParams.get("key") !== PANEL_KEY) return jsonR({ error: "unauthorized" }, 401);

  const db = admin();

  if (req.method === "GET" && url.searchParams.get("gallery")) {
    await ensureBucket(db, BUCKET);
    const { data, error } = await db.storage.from(BUCKET).list("", { limit: 60, sortBy: { column: "created_at", order: "desc" } });
    if (error) return jsonR({ error: error.message }, 500);
    const images = (data ?? []).filter((f) => f.name && !f.name.startsWith(".")).map((f) => ({
      name: f.name, url: db.storage.from(BUCKET).getPublicUrl(f.name).data.publicUrl, created_at: f.created_at,
    }));
    return jsonR({ images });
  }

  if (req.method === "GET" && url.searchParams.get("clients")) {
    const { data, error } = await db.from("aa_clients").select("id,name,logo_url").order("name", { ascending: true });
    if (error) return jsonR({ error: error.message }, 500);
    return jsonR({ clients: data ?? [] });
  }

  if (req.method !== "POST") return jsonR({ error: "method_not_allowed" }, 405);
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const action = String(body.action ?? "");

  try {
    // --- Clientes ---
    if (action === "add_client") {
      const name = String(body.name ?? "").trim();
      if (!name) return jsonR({ error: "nome_vazio" }, 400);
      let logo_url: string | null = null;
      if (body.logo) { await ensureBucket(db, LOGOS); logo_url = await uploadB64(db, stripDataUrl(String(body.logo)), LOGOS); }
      const { data, error } = await db.from("aa_clients").upsert({ name, logo_url }, { onConflict: "name" }).select().single();
      if (error) return jsonR({ error: error.message }, 500);
      return jsonR({ ok: true, client: data });
    }
    if (action === "delete_client") {
      const id = String(body.id ?? "");
      if (!id) return jsonR({ error: "id_vazio" }, 400);
      await db.from("aa_clients").delete().eq("id", id);
      return jsonR({ ok: true });
    }

    const n = Math.min(Math.max(parseInt(String(body.n ?? "1"), 10) || 1, 1), 4);
    const size = sizeFromFormat(body.format as string);

    // --- Criar a partir de prompt ---
    if (action === "create") {
      const prompt = String(body.prompt ?? "").trim();
      if (!prompt) return jsonR({ error: "prompt_vazio" }, 400);
      await ensureBucket(db, BUCKET);
      const model = String(body.model ?? "gpt");
      const quality = String(body.quality ?? "low");
      const overlay = body.overlay_logo ? stripDataUrl(String(body.overlay_logo)) : "";
      const pos = String(body.logo_pos ?? "top-right");
      const jobs = Array.from({ length: n }, () =>
        (model === "gemini"
          ? geminiImage([{ text: `${prompt}\n\nGere a imagem no formato/aspecto ${body.format ?? "1:1"}.${overlay ? " Deixe um espaço livre para a logo (não desenhe logo)." : ""}` }])
          : openaiImage(prompt, size, quality))
          .then((b64) => overlay ? overlayLogo(b64, overlay, pos) : b64)
          .then((b64) => uploadB64(db, b64, BUCKET)));
      const results = await Promise.allSettled(jobs);
      const images = results.filter((r) => r.status === "fulfilled").map((r) => (r as PromiseFulfilledResult<string>).value);
      const erro = results.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
      if (!images.length) return jsonR({ error: erro ? (erro.reason as Error).message : "falha_ao_gerar" }, 500);
      return jsonR({ images, partial: images.length < n });
    }

    // --- Editar / trocar logo (Gemini) ---
    if (action === "edit") {
      const base = body.base ? stripDataUrl(String(body.base)) : "";
      if (!base) return jsonR({ error: "imagem_base_faltando" }, 400);
      await ensureBucket(db, BUCKET);
      const instruction = String(body.instruction ?? "Edite a imagem conforme solicitado, mantendo o restante igual.").trim();
      const parts: unknown[] = [{ text: instruction }, { inlineData: { mimeType: "image/png", data: base } }];
      if (body.logo) parts.push({ inlineData: { mimeType: "image/png", data: stripDataUrl(String(body.logo)) } });
      const b64 = await geminiImage(parts);
      return jsonR({ images: [await uploadB64(db, b64, BUCKET)] });
    }

    return jsonR({ error: "acao_desconhecida" }, 400);
  } catch (e) {
    return jsonR({ error: (e as Error).message }, 500);
  }
});

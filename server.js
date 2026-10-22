const express = require("express");
const multer = require("multer");
const { execFile } = require("child_process");
const fs = require("fs/promises");
const path = require("path");
const os = require("os");

const app = express();
const ORIGINS = (process.env.ALLOWED_ORIGINS || "*").split(",").map(s => s.trim());
const MAX_MB = 10;

app.use((req, res, next) => {
  const o = req.headers.origin;
  if (ORIGINS.includes("*")) res.set("Access-Control-Allow-Origin", "*");
  else if (o && ORIGINS.includes(o)) { res.set("Access-Control-Allow-Origin", o); res.set("Vary", "Origin"); }
  res.set("Access-Control-Allow-Headers", "Content-Type");
  res.set("Access-Control-Allow-Methods", "POST,GET,OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

const upload = multer({ dest: os.tmpdir(), limits: { fileSize: MAX_MB * 1024 * 1024 } });

const OFFICE = [".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".odt", ".ods", ".odp", ".rtf", ".csv"];
const MODES = {
  topdf: { exts: OFFICE, target: "pdf", out: ".pdf", mime: "application/pdf" },
  pdf2docx: {
    exts: [".pdf"], infilter: "writer_pdf_import", target: "docx:MS Word 2007 XML", out: ".docx",
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  }
};

// แปลงทีละไฟล์ (คิว) เพื่อไม่ให้แรมเต็ม
let queue = Promise.resolve();

async function run(file, m, ext) {
  const id = Date.now() + "-" + Math.random().toString(36).slice(2, 8);
  const dir = path.join(os.tmpdir(), "job-" + id);
  try {
    await fs.mkdir(dir);
    const inp = path.join(dir, "input" + ext);
    await fs.rename(file.path, inp);
    const args = ["--headless", "--norestore", `-env:UserInstallation=file://${dir}/profile`];
    if (m.infilter) args.push(`--infilter=${m.infilter}`);
    args.push("--convert-to", m.target, "--outdir", dir, inp);
    await new Promise((ok, no) => execFile("soffice", args, { timeout: 120000 }, e => (e ? no(e) : ok())));
    return await fs.readFile(path.join(dir, "input" + m.out));
  } finally {
    fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    fs.unlink(file.path).catch(() => {});
  }
}

app.get("/", (req, res) => res.send("ok"));

app.post("/convert/:mode", upload.single("file"), (req, res) => {
  const m = MODES[req.params.mode];
  if (!m || !req.file) return res.status(400).json({ error: "คำขอไม่ถูกต้อง" });
  const ext = path.extname(req.file.originalname || "").toLowerCase();
  if (!m.exts.includes(ext)) {
    fs.unlink(req.file.path).catch(() => {});
    return res.status(400).json({ error: "ชนิดไฟล์ไม่รองรับ" });
  }
  queue = queue.then(async () => {
    try {
      const data = await run(req.file, m, ext);
      res.set("Content-Type", m.mime).send(data);
    } catch (e) {
      console.error(e);
      if (!res.headersSent) res.status(500).json({ error: "แปลงไฟล์ไม่สำเร็จ ลองไฟล์ที่เล็กลง" });
    }
  });
});

app.use((err, req, res, next) => {
  if (err && err.code === "LIMIT_FILE_SIZE") return res.status(413).json({ error: `ไฟล์ใหญ่เกิน ${MAX_MB} MB` });
  res.status(500).json({ error: "เกิดข้อผิดพลาด" });
});

app.listen(process.env.PORT || 10000, () => console.log("ready"));

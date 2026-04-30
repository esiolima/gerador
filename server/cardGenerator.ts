// (código completo — substitua tudo)

import path from "path";
import fs from "fs";
import puppeteer, { Browser } from "puppeteer-core";
import archiver from "archiver";
import xlsx from "xlsx";
import { EventEmitter } from "events";

const BASE_DIR = path.resolve();
const OUTPUT_DIR = path.join(BASE_DIR, "output");
const TMP_DIR = path.join(BASE_DIR, "tmp");
const TEMPLATES_DIR = path.join(BASE_DIR, "templates");
const LOGOS_DIR = path.join(BASE_DIR, "logos");
const SELOS_DIR = path.join(BASE_DIR, "selos");

const VALID_TYPES = ["promocao", "cupom", "cashback", "queda", "bc"];

export class CardGenerator extends EventEmitter {
  private browser: Browser | null = null;

  async initialize() {
    for (const dir of [OUTPUT_DIR, TMP_DIR]) {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    }

    this.browser = await puppeteer.launch({
      executablePath:
        process.env.PUPPETEER_EXECUTABLE_PATH ||
        process.env.CHROME_BIN ||
        "/usr/bin/chromium",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--font-render-hinting=none",
      ],
      headless: true,
    });
  }

  normalizeType(tipo: string): string {
    if (!tipo) return "";

    const normalized = String(tipo)
      .toLowerCase()
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

    if (normalized.includes("promo")) return "promocao";
    if (normalized.includes("cupom")) return "cupom";
    if (normalized.includes("queda")) return "queda";
    if (normalized.includes("cashback")) return "cashback";
    if (normalized === "bc") return "bc";

    return "";
  }

  private injectFittingHelpers(html: string): string {
    const helper = `
<style>
  .card-root {
    border-radius: 20px;
    overflow: hidden;
    background: #fff;
  }

  .logo img, .selo img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  #valor-texto, #cupom-text {
    text-align: center;
    display: block;
  }
</style>

<script>
(function(){
  function fit(el, container, max, min, nowrap){
    if(!el || !container) return;

    el.style.whiteSpace = nowrap ? "nowrap" : "normal";
    el.style.wordBreak = "keep-all";
    el.style.overflowWrap = "normal";

    for(let size = max; size >= min; size--){
      el.style.fontSize = size + "px";

      if(
        el.scrollWidth <= container.clientWidth &&
        el.scrollHeight <= container.clientHeight
      ){
        break;
      }
    }
  }

  function run(){
    fit(
      document.getElementById("valor-texto"),
      document.querySelector(".valor-container"),
      520,
      20,
      false
    );

    fit(
      document.getElementById("cupom-text"),
      document.querySelector(".cupom-codigo"),
      140,
      20,
      true
    );
  }

  window.addEventListener("load", run);
})();
</script>
`;

    return html.replace("</body>", helper + "</body>");
  }

  async generateCards(excelFilePath: string, originalFileName?: string) {
    if (!this.browser) throw new Error("Browser not initialized");

    const jobId = `job_${Date.now()}`;
    const jobDir = path.join(OUTPUT_DIR, jobId);
    fs.mkdirSync(jobDir, { recursive: true });

    const workbook = xlsx.readFile(excelFilePath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows: any[] = xlsx.utils.sheet_to_json(sheet, { defval: "" });

    let processed = 0;
    const cards: any[] = [];

    for (const [index, row] of rows.entries()) {
      const tipo = this.normalizeType(row.tipo);

      const templatePath = path.join(TEMPLATES_DIR, `${tipo}.html`);
      let html = fs.readFileSync(templatePath, "utf8");

      html = this.injectFittingHelpers(html);

      const tmpHtmlPath = path.join(TMP_DIR, `card_${index}.html`);
      fs.writeFileSync(tmpHtmlPath, html);

      const page = await this.browser.newPage();

      await page.setViewport({
        width: 700,
        height: 1058,
        deviceScaleFactor: 2,
      });

      await page.goto(`file://${tmpHtmlPath}`, {
        waitUntil: "networkidle0",
      });

      await page.evaluate(async () => {
        await Promise.all(
          Array.from(document.images).map((img) =>
            img.complete
              ? Promise.resolve()
              : new Promise((res) => {
                  img.onload = res;
                  img.onerror = res;
                })
          )
        );
      });

      const pdfPath = path.join(jobDir, `card_${index}.pdf`);
      const pngPath = path.join(jobDir, `card_${index}.png`);

      await page.pdf({
        path: pdfPath,
        width: "700px",
        height: "1058px",
        printBackground: true,
        margin: { top: "0px", right: "0px", bottom: "0px", left: "0px" },
      });

      await page.screenshot({
        path: pngPath,
        type: "png",
      });

      await page.close();

      processed++;

      this.emit("progress", {
        processed,
        total: rows.length,
        percentage: Math.round((processed / rows.length) * 100),
        currentCard: `${processed}/${rows.length}`,
      });
    }

    return {
      jobId,
      cards,
      totalRows: rows.length,
      processedRows: processed,
    };
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

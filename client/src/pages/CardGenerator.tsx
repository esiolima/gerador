import { useEffect, useMemo, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Upload,
  CheckCircle2,
  Download,
  Hourglass,
  Image as ImageIcon,
  Newspaper,
  FileDown,
  FileText,
  RefreshCcw,
  Pencil,
  AlertCircle,
  Palette,
} from "lucide-react";

type ProgressData = {
  total: number;
  processed: number;
  percentage: number;
  currentCard: string;
};

type GeneratedCard = {
  ordem: string;
  tipo: string;
  categoria: string;
  html: string;
  hasLogo: boolean;
};

type ProcessResult = {
  jobId?: string;
  zipPath: string;
  fileName?: string;
  cards: GeneratedCard[];
  totalRows: number;
  processedRows: number;
};

type JournalPagePayload = {
  type: "cover" | "category" | "ad";
  title: string;
  html: string;
};

type JournalCardPage = {
  category: string;
  cards: GeneratedCard[];
  pageIndexWithinCategory: number;
  isContinuation: boolean;
};

const FIRST_CATEGORY_PAGE_CARD_LIMIT = 6;
const CONTINUATION_CATEGORY_PAGE_CARD_LIMIT = 9;

function getReadableTextColor(backgroundColor: string) {
  const normalized = String(backgroundColor || "#ffffff").trim();
  const hexMatch = normalized.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);

  if (!hexMatch) return "#111111";

  const r = parseInt(hexMatch[1], 16);
  const g = parseInt(hexMatch[2], 16);
  const b = parseInt(hexMatch[3], 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  return luminance > 0.58 ? "#111111" : "#ffffff";
}

function buildJournalCardPages(
  groupedCards: [string, GeneratedCard[]][]
): JournalCardPage[] {
  const pages: JournalCardPage[] = [];

  groupedCards.forEach(([category, cards]) => {
    let remainingCards = [...cards];
    let pageIndexWithinCategory = 0;

    while (remainingCards.length > 0) {
      const limit =
        pageIndexWithinCategory === 0
          ? FIRST_CATEGORY_PAGE_CARD_LIMIT
          : CONTINUATION_CATEGORY_PAGE_CARD_LIMIT;

      const pageCards = remainingCards.slice(0, limit);
      remainingCards = remainingCards.slice(limit);

      pages.push({
        category,
        cards: pageCards,
        pageIndexWithinCategory,
        isContinuation: pageIndexWithinCategory > 0,
      });

      pageIndexWithinCategory += 1;
    }
  });

  return pages;
}

function readImageAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function groupByCategory(cards: GeneratedCard[]) {
  const groups: Record<string, GeneratedCard[]> = {};

  cards.forEach((card) => {
    const category = card.categoria?.trim() || "SEM CATEGORIA";
    if (!groups[category]) groups[category] = [];
    groups[category].push(card);
  });

  return Object.entries(groups);
}

function extractCardHtml(html: string) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  const styles = Array.from(doc.querySelectorAll("style"))
    .map((style) => style.outerHTML)
    .join("\n");

  const body = doc.body?.innerHTML || html;

  return `
    ${styles}
    <style>
      :host {
        display:block;
        width:700px;
        height:1058px;
        overflow:hidden;
        background:#fff;
      }

      * {
        box-sizing:border-box;
      }

      .logo {
        cursor:pointer !important;
      }

      .logo:empty,
      .logo:not(:has(img)),
      .logo img[src=""] {
        background:#f1f1f1;
        border:2px dashed #d2d2d2;
        border-radius:14px;
      }
    </style>
    ${body}
  `;
}

function runCardFit(root: ShadowRoot) {
  const fitText = (
    el: HTMLElement | null,
    container: HTMLElement | null,
    options: { max: number; min: number; nowrap?: boolean; lineHeight?: string }
  ) => {
    if (!el || !container) return;

    el.style.display = "block";
    el.style.maxWidth = "100%";
    el.style.textAlign = "center";
    el.style.whiteSpace = options.nowrap ? "nowrap" : "normal";
    el.style.wordBreak = "keep-all";
    el.style.overflowWrap = "normal";
    el.style.lineHeight = options.lineHeight || "0.92";

    for (let size = options.max; size >= options.min; size--) {
      el.style.fontSize = `${size}px`;

      if (
        el.scrollWidth <= container.clientWidth &&
        el.scrollHeight <= container.clientHeight
      ) {
        break;
      }
    }
  };

  fitText(
    (root.getElementById("valor-texto") ||
      root.querySelector(".valor-texto")) as HTMLElement | null,
    (root.getElementById("valor-container") ||
      root.querySelector(".valor-container")) as HTMLElement | null,
    { max: 520, min: 22, nowrap: false, lineHeight: "0.9" }
  );

  fitText(
    root.getElementById("cupom-text") as HTMLElement | null,
    root.querySelector(".cupom-codigo") as HTMLElement | null,
    { max: 120, min: 18, nowrap: true, lineHeight: "1" }
  );

  const segmento = root.getElementById("segmento-bloco") as HTMLElement | null;
  if (segmento && segmento.textContent?.includes("{{SEGMENTO}}")) {
    segmento.style.display = "none";
  }

  const logo = root.querySelector(".logo") as HTMLElement | null;
  const logoImg = logo?.querySelector("img") as HTMLImageElement | null;
  if (logo && logoImg && !logoImg.getAttribute("src")) {
    logoImg.style.display = "none";
  }
}

function ShadowCard({
  html,
  cardKey,
}: {
  html: string;
  cardKey: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const shadow = host.shadowRoot || host.attachShadow({ mode: "open" });
    shadow.innerHTML = extractCardHtml(html);

    const setup = () => {
      runCardFit(shadow);

      const logo = shadow.querySelector(".logo") as HTMLElement | null;
      if (!logo) return;

      logo.onclick = (event) => {
        event.stopPropagation();

        const input = document.createElement("input");
        input.type = "file";
        input.accept = "image/*";

        input.onchange = async (changeEvent: Event) => {
          const target = changeEvent.target as HTMLInputElement | null;
          const selectedFile = target?.files?.[0];

          if (!selectedFile) return;

          if (!selectedFile.type.startsWith("image/")) {
            window.alert("Envie apenas arquivos de imagem.");
            return;
          }

          const dataUrl = await readImageAsDataUrl(selectedFile);

          let image = logo.querySelector("img") as HTMLImageElement | null;

          if (!image) {
            image = document.createElement("img");
            image.alt = "Logo";
            logo.appendChild(image);
          }

          image.src = dataUrl;
          image.style.display = "block";
        };

        input.click();
      };
    };

    requestAnimationFrame(setup);
  }, [html]);

  return (
    <div
      ref={hostRef}
      className="journal-card-shadow-host"
      data-card-key={cardKey}
    />
  );
}

function serializeElementForPdf(element: HTMLElement) {
  const clone = element.cloneNode(true) as HTMLElement;

  const originalHosts = Array.from(
    element.querySelectorAll(".journal-card-shadow-host")
  ) as HTMLDivElement[];

  const clonedHosts = Array.from(
    clone.querySelectorAll(".journal-card-shadow-host")
  ) as HTMLDivElement[];

  clonedHosts.forEach((clonedHost, index) => {
    const originalHost = originalHosts[index];
    const shadowHtml = originalHost?.shadowRoot?.innerHTML || "";

    clonedHost.innerHTML = `
      <template shadowrootmode="open">
        ${shadowHtml}
      </template>
    `;
  });

  const activateDeclarativeShadowDom = `
    <script>
      document.querySelectorAll("template[shadowrootmode]").forEach(function(template) {
        var mode = template.getAttribute("shadowrootmode") || "open";
        var parent = template.parentNode;
        if (!parent || parent.shadowRoot) return;

        try {
          if (typeof parent.setHTMLUnsafe === "function") {
            parent.setHTMLUnsafe(template.innerHTML);
          } else {
            var shadow = parent.attachShadow({ mode: mode });
            shadow.appendChild(template.content.cloneNode(true));
            template.remove();
          }
        } catch (e) {
          console.error("Erro ao ativar Shadow DOM:", e);
        }
      });
    </script>
  `;

  return `<style>${journalCss}</style>${clone.outerHTML}${activateDeclarativeShadowDom}`;
}

function buildJournalPagesForPdf(journalElement: HTMLDivElement): JournalPagePayload[] {
  const pageElements = Array.from(
    journalElement.querySelectorAll("[data-journal-page]")
  ) as HTMLElement[];

  return pageElements.map((pageElement, index) => {
    const rawType = pageElement.getAttribute("data-journal-page") || "category";
    const type = rawType === "cover" || rawType === "ad" ? rawType : "category";
    const title =
      pageElement.getAttribute("data-journal-title") ||
      (type === "cover" ? "Capa" : type === "ad" ? "Anúncio" : `Categoria ${index}`);

    return {
      type,
      title,
      html: serializeElementForPdf(pageElement),
    };
  });
}

const PAGE_BACKGROUND_STORAGE_KEY = "jornal_page_background";

export default function CardGenerator() {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<ProgressData | null>(null);
  const [result, setResult] = useState<ProcessResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [sessionId] = useState(
    () => `session_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
  );

  const [isDragging, setIsDragging] = useState(false);
  const [showJournal, setShowJournal] = useState(false);

  const [coverImage, setCoverImage] = useState<string>("/assets/capa.png");
  const [headerImage, setHeaderImage] = useState<string>("/assets/header.png");
  const [adImage, setAdImage] = useState<string>("/assets/anuncio.png");
  const [pageBackground, setPageBackground] = useState<string>(() => {
    if (typeof window === "undefined") return "#ffffff";

    return window.localStorage.getItem(PAGE_BACKGROUND_STORAGE_KEY) || "#ffffff";
  });

  const [footerText, setFooterText] = useState(
    "Ofertas válidas enquanto durarem os estoques. Consulte condições, disponibilidade e regulamento nos canais oficiais."
  );

  const [isGeneratingJournal, setIsGeneratingJournal] = useState(false);
  const [journalProgress, setJournalProgress] = useState({ step: 0, message: "" });
  const [journalError, setJournalError] = useState<string | null>(null);
  const [journalDownloadUrl, setJournalDownloadUrl] = useState<string | null>(null);
  const [journalDownloadFileName, setJournalDownloadFileName] = useState<string>("jornal-diagramado.pdf");

  const socketRef = useRef<Socket | null>(null);
  const journalRef = useRef<HTMLDivElement>(null);

  const coverInputRef = useRef<HTMLInputElement>(null);
  const headerInputRef = useRef<HTMLInputElement>(null);
  const adInputRef = useRef<HTMLInputElement>(null);

  const [, setLocation] = useLocation();

  const generateCardsMutation = trpc.card.generateCards.useMutation();
  const groupedCards = useMemo(() => groupByCategory(result?.cards ?? []), [result]);
  const journalCardPages = useMemo(
    () => buildJournalCardPages(groupedCards),
    [groupedCards]
  );
  const footerTextColor = useMemo(
    () => getReadableTextColor(pageBackground),
    [pageBackground]
  );
  const footerBorderColor =
    footerTextColor === "#ffffff"
      ? "rgba(255,255,255,.38)"
      : "rgba(0,0,0,.16)";

  useEffect(() => {
    const socket = io({
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
    });

    socket.on("connect", () => socket.emit("join", sessionId));

    socket.on("progress", (data: ProgressData) => {
      setProgress(data);
    });

    socket.on("error", (message: string) => {
      setError(message);
      window.alert(message);
      setIsProcessing(false);
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
    };
  }, [sessionId]);

  useEffect(() => {
    window.localStorage.setItem(PAGE_BACKGROUND_STORAGE_KEY, pageBackground);
  }, [pageBackground]);

  const handleFileSelect = (selectedFile: File | null | undefined) => {
    if (!selectedFile) return;

    if (!selectedFile.name.toLowerCase().endsWith(".xlsx")) {
      const message = "Arquivo inválido: envie uma planilha no formato .xlsx.";
      setError(message);
      window.alert(message);
      return;
    }

    setFile(selectedFile);
    setError(null);
    setResult(null);
    setShowJournal(false);
  };

  const handleUpload = async () => {
    if (!file) return;

    setIsProcessing(true);
    setProgress({
      total: 0,
      processed: 0,
      percentage: 0,
      currentCard: "Preparando upload...",
    });
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const uploadResponse = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const uploadJson = await uploadResponse.json();

      if (!uploadResponse.ok) {
        throw new Error(uploadJson.error || "Erro ao enviar arquivo.");
      }

      const data = await generateCardsMutation.mutateAsync({
        filePath: uploadJson.filePath,
        sessionId,
        originalFileName: uploadJson.fileName,
      });

      setResult(data as ProcessResult);

      setProgress({
        total: data.totalRows,
        processed: data.processedRows,
        percentage: 100,
        currentCard: "Finalizado",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao processar a planilha.";
      setError(message);
      window.alert(message);
    } finally {
      setIsProcessing(false);
    }
  };

  const changeImage = async (
    kind: "cover" | "header" | "ad",
    selectedFile?: File | null
  ) => {
    if (!selectedFile) return;

    if (!selectedFile.type.startsWith("image/")) {
      window.alert("Envie apenas arquivos de imagem.");
      return;
    }

    const dataUrl = await readImageAsDataUrl(selectedFile);

    if (kind === "cover") setCoverImage(dataUrl);
    if (kind === "header") setHeaderImage(dataUrl);
    if (kind === "ad") setAdImage(dataUrl);
  };

  const generateJournalPdf = async () => {
    if (!journalRef.current || !result) return;

    setIsGeneratingJournal(true);
    setJournalError(null);
    setJournalDownloadUrl(null);
    setJournalDownloadFileName("jornal-diagramado.pdf");
    setJournalProgress({ step: 5, message: "Iniciando geração do jornal diagramado..." });

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      controller.abort();
    }, 240000);

    let fakeProgressTimer: number | null = null;

    try {
      await new Promise((resolve) => window.setTimeout(resolve, 150));

      setJournalProgress({ step: 15, message: "Separando capa, categorias e anúncio..." });
      const pages = buildJournalPagesForPdf(journalRef.current);

      if (!pages.length) {
        throw new Error("Nenhuma página do jornal foi encontrada para gerar o PDF.");
      }

      setJournalProgress({
        step: 30,
        message: `Preparando ${pages.length} páginas independentes...`,
      });

      fakeProgressTimer = window.setInterval(() => {
        setJournalProgress((current) => {
          if (current.step >= 92) {
            return {
              step: current.step,
              message: "Servidor ainda renderizando e juntando os PDFs. Aguarde...",
            };
          }

          const nextStep = Math.min(current.step + 3, 92);

          let message = "Renderizando capa, categorias e anúncio...";

          if (nextStep >= 55) {
            message = "Gerando um PDF para cada página...";
          }

          if (nextStep >= 75) {
            message = "Juntando os PDFs em um único arquivo...";
          }

          if (nextStep >= 88) {
            message = "Finalizando arquivo para download...";
          }

          return {
            step: nextStep,
            message,
          };
        });
      }, 2500);

      const response = await fetch("/api/journal/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pages,
          jobId: result?.jobId,
          fileName: result?.fileName,
        }),
        signal: controller.signal,
      });

      if (fakeProgressTimer) {
        window.clearInterval(fakeProgressTimer);
        fakeProgressTimer = null;
      }

      setJournalProgress({ step: 96, message: "Recebendo resposta do servidor..." });

      const json = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(json?.error || "Erro ao gerar PDF do jornal.");
      }

      if (!json?.pdfPath && !json?.downloadUrl) {
        throw new Error("PDF gerado, mas o servidor não retornou o link de download.");
      }

      const downloadUrl =
        json.downloadUrl || `/api/journal/download?pdfPath=${encodeURIComponent(json.pdfPath)}`;

      setJournalDownloadUrl(downloadUrl);
      setJournalDownloadFileName(json.fileName || "jornal-diagramado.pdf");
      setJournalProgress({ step: 100, message: "PDF pronto para download." });
    } catch (err) {
      if (fakeProgressTimer) {
        window.clearInterval(fakeProgressTimer);
      }

      const message =
        err instanceof DOMException && err.name === "AbortError"
          ? "A geração do PDF demorou demais e foi interrompida. Tente novamente com imagens mais leves."
          : err instanceof Error
            ? err.message
            : "Erro ao gerar PDF do jornal.";

      console.error("[generateJournalPdf]", err);
      setJournalError(message);
      setJournalProgress({ step: 100, message: "Falha ao gerar PDF do jornal." });
    } finally {
      window.clearTimeout(timeoutId);
    }
  };

  const reset = () => {
    setFile(null);
    setResult(null);
    setProgress(null);
    setShowJournal(false);
    setError(null);
    setIsProcessing(false);
    setIsGeneratingJournal(false);
    setJournalError(null);
    setJournalDownloadUrl(null);
    setJournalDownloadFileName("jornal-diagramado.pdf");
  };

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#06111f] font-sans text-white">
      <div
        className="fixed inset-0 z-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 55% 45% at 8% 95%, rgba(37,99,235,0.34), transparent 65%), radial-gradient(ellipse 50% 60% at 95% 0%, rgba(14,165,233,0.30), transparent 62%), linear-gradient(180deg,#06111f 0%,#071827 100%)",
        }}
      />

      <main className="relative z-10 mx-auto max-w-7xl space-y-10 px-6 py-16">
        <section className="grid items-center gap-8 lg:grid-cols-[1fr_420px]">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/60 backdrop-blur">
              <span className="h-2 w-2 rounded-full bg-sky-400" />
              Gerador de Cards + Jornal Diagramado
            </div>

            <h1 className="text-5xl font-black leading-[0.95] tracking-tight md:text-7xl">
              Planilhas viram{" "}
              <span className="bg-gradient-to-r from-sky-300 to-blue-500 bg-clip-text text-transparent">
                campanhas
              </span>{" "}
              prontas.
            </h1>

            <p className="max-w-2xl text-lg text-white/55">
              Envie o Excel, gere cards em PDF, baixe o ZIP e monte um jornal de ofertas
              editável com capa, categorias, grid automático e exportação final em PDF.
            </p>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-6 shadow-2xl backdrop-blur-xl">
            {!result && (
              <div className="space-y-5">
                <div
                  onClick={() => document.getElementById("file-input")?.click()}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={(event) => {
                    event.preventDefault();
                    setIsDragging(false);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    setIsDragging(false);
                    handleFileSelect(event.dataTransfer.files[0]);
                  }}
                  className={`group cursor-pointer rounded-[1.5rem] border-2 border-dashed p-10 text-center transition ${
                    isDragging
                      ? "border-sky-400 bg-sky-400/10"
                      : "border-white/15 bg-black/20 hover:border-sky-400/60"
                  }`}
                >
                  <Upload className="mx-auto mb-4 h-12 w-12 text-sky-400" />
                  <p className="text-xl font-bold">Arraste ou selecione o Excel</p>
                  <p className="mt-2 text-sm text-white/40">
                    Colunas extras serão ignoradas. Erros aparecem em popup.
                  </p>

                  <input
                    id="file-input"
                    type="file"
                    accept=".xlsx"
                    onChange={(event) => handleFileSelect(event.target.files?.[0])}
                    className="hidden"
                  />
                </div>

                {file && (
                  <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/80">
                    <CheckCircle2 className="mr-2 inline h-4 w-4 text-sky-400" />
                    {file.name}
                  </div>
                )}

                {error && (
                  <div className="rounded-xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-200">
                    <AlertCircle className="mr-2 inline h-4 w-4" />
                    {error}
                  </div>
                )}

                <div className="flex gap-3">
                  <Button
                    disabled={!file || isProcessing}
                    onClick={handleUpload}
                    className="h-13 flex-1 rounded-xl bg-blue-600 text-base font-bold hover:bg-blue-700 disabled:opacity-40"
                  >
                    {isProcessing ? "Processando..." : "Processar planilha"}
                  </Button>

                  <Button
                    onClick={() => setLocation("/logos")}
                    className="h-13 rounded-xl border border-white/10 bg-white/10 px-5 hover:bg-white/15"
                  >
                    <ImageIcon className="h-5 w-5" />
                  </Button>
                </div>
              </div>
            )}

            {isProcessing && progress && (
              <div className="space-y-6 py-6 text-center">
                <Hourglass className="mx-auto h-12 w-12 animate-spin text-sky-400" />

                <div>
                  <h2 className="text-2xl font-black">Processando cards</h2>
                  <p className="text-white/45">
                    {progress.processed} de {progress.total}
                  </p>
                </div>
   
                <div className="h-3 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full bg-blue-500 transition-all"
                    style={{ width: `${progress.percentage}%` }}
                  />
                </div>

                <p className="text-sm text-white/45">
                  {progress.processed} de {progress.total || "..."} cards processados
                </p>
              </div>
            )}

            {result && (
              <div className="space-y-5 py-3 text-center">
                <CheckCircle2 className="mx-auto h-14 w-14 text-teal-300" />

                <div>
                  <h2 className="text-2xl font-black">Cards prontos</h2>
                  <p className="text-white/45">
                    {result.processedRows} cards processados com sucesso
                  </p>
                </div>

                <Button
                  onClick={() =>
                    (window.location.href = `/api/download?zipPath=${encodeURIComponent(
                      result.zipPath
                    )}`)
                  }
                  className="h-13 w-full rounded-xl bg-teal-600 text-base font-bold hover:bg-teal-700"
                >
                  <Download className="mr-2 h-5 w-5" />
                  Baixar Cards (ZIP)
                </Button>

                <Button
                  onClick={() => setShowJournal(true)}
                  className="h-13 w-full rounded-xl bg-blue-600 text-base font-bold hover:bg-blue-700"
                >
                  <Newspaper className="mr-2 h-5 w-5" />
                  Diagramar Jornal
                </Button>

                <Button variant="ghost" onClick={reset} className="text-white/45 hover:text-white">
                  <RefreshCcw className="mr-2 h-4 w-4" />
                  Novo processamento
                </Button>
              </div>
            )}

            <div className="mt-5 border-t border-white/10 pt-4 text-center">
              <p className="text-xs font-medium tracking-wide text-white/35">
                Desenvolvido por Esio Lima • Versão 4.0
              </p>
            </div>
          </div>
        </section>

        {showJournal && result && (
          <section className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-white/10 bg-white/[0.06] p-5 backdrop-blur-xl">
              <div>
                <h2 className="text-2xl font-black">Editor visual do jornal</h2>
                <p className="text-sm text-white/45">
                  Clique na capa, cabeçalho, anúncio ou logo dos cards para substituir as
                  imagens. Cada categoria será gerada como uma página independente.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <label className="flex h-12 cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-4 text-sm font-bold text-white hover:bg-white/15">
                  <Palette className="h-5 w-5" />
                  Fundo
                  <input
                    type="color"
                    value={pageBackground}
                    onChange={(event) => setPageBackground(event.target.value)}
                    className="h-7 w-9 cursor-pointer rounded border-0 bg-transparent p-0"
                  />
                </label>

                <Button
                  disabled={isGeneratingJournal}
                  onClick={generateJournalPdf}
                  className="h-12 rounded-xl bg-white text-black hover:bg-white/90"
                >
                  <FileDown className="mr-2 h-5 w-5" />
                  {isGeneratingJournal ? "Gerando PDF..." : "Gerar em PDF"}
                </Button>
              </div>
            </div>

            <div className="journal-preview-viewport">
              <div className="journal-preview-scaler">
                <div ref={journalRef} className="journal-root">
                  <div className="journal-page-label">Página 1 — Capa</div>

                  <div
                    className="journal-page journal-cover-page"
                    data-journal-page="cover"
                    data-journal-title="Capa"
                    onClick={() => coverInputRef.current?.click()}
                  >
                    <img src={coverImage} alt="Capa do jornal" />
                    <div className="journal-placeholder">
                      <Pencil className="h-8 w-8" />
                      Clique para escolher capa
                    </div>
                  </div>

                  {journalCardPages.map((journalPage, pageIndex) => {
                    const nextPage = journalCardPages[pageIndex + 1];
                    const isLastPageOfCategory =
                      !nextPage || nextPage.category !== journalPage.category;

                    return (
                      <div
                        key={`${journalPage.category}-${journalPage.pageIndexWithinCategory}`}
                      >
                        <div className="journal-page-label">
                          Página {pageIndex + 2} — {journalPage.category}
                          {journalPage.isContinuation ? " — continuação" : ""}
                        </div>

                        <section
                          className={`journal-category-page ${
                            journalPage.isContinuation ? "is-continuation" : ""
                          } ${isLastPageOfCategory ? "is-last-category-page" : ""}`}
                          data-journal-page="category"
                          data-journal-title={
                            journalPage.isContinuation
                              ? `${journalPage.category} - continuação ${journalPage.pageIndexWithinCategory + 1}`
                              : journalPage.category
                          }
                          style={{ background: pageBackground }}
                        >
                          {!journalPage.isContinuation && (
                            <>
                              <div
                                className="journal-header"
                                onClick={() => headerInputRef.current?.click()}
                              >
                                <img src={headerImage} alt="Cabeçalho do jornal" />
                                <span>Cabeçalho</span>
                              </div>

                              <div className="journal-category-bar">
                                {journalPage.category}
                              </div>
                            </>
                          )}

                          <div className="journal-grid">
                            {journalPage.cards.map((card, index) => (
                              <div
                                className="journal-card-wrap"
                                key={`${card.ordem}-${card.tipo}-${index}`}
                              >
                                <ShadowCard
                                  html={card.html}
                                  cardKey={`${card.ordem}-${card.tipo}-${index}`}
                                />
                              </div>
                            ))}
                          </div>

                          {isLastPageOfCategory && (
                            <div
                              className="journal-footer-text"
                              style={{
                                color: footerTextColor,
                                borderTopColor: footerBorderColor,
                              }}
                              contentEditable
                              suppressContentEditableWarning
                              onBlur={(event) => setFooterText(event.currentTarget.innerText)}
                            >
                              {footerText}
                            </div>
                          )}
                        </section>
                      </div>
                    );
                  })}

                  <div className="journal-page-label">
                    Página {journalCardPages.length + 2} — Anúncio
                  </div>

                  <div
                    className="journal-page journal-ad-page"
                    data-journal-page="ad"
                    data-journal-title="Anúncio"
                    onClick={() => adInputRef.current?.click()}
                  >
                    <img src={adImage} alt="Anúncio do jornal" />
                    <div className="journal-placeholder">
                      <Pencil className="h-8 w-8" />
                      Clique para escolher anúncio
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <input
              ref={coverInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => changeImage("cover", event.target.files?.[0])}
            />

            <input
              ref={headerInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => changeImage("header", event.target.files?.[0])}
            />

            <input
              ref={adInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => changeImage("ad", event.target.files?.[0])}
            />
          </section>
        )}
      </main>

      <style>{journalCss}</style>

      {isGeneratingJournal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl">
            <div className="mb-6 flex flex-col items-center text-center">
              <div
                className={`mb-4 flex h-16 w-16 items-center justify-center rounded-full ${
                  journalError
                    ? "bg-red-50 text-red-600"
                    : journalDownloadUrl
                      ? "bg-teal-50 text-teal-600"
                      : "bg-blue-50 text-blue-600"
                }`}
              >
                {journalError ? (
                  <AlertCircle className="h-8 w-8" />
                ) : journalDownloadUrl ? (
                  <CheckCircle2 className="h-8 w-8" />
                ) : (
                  <FileText className="h-8 w-8 animate-pulse" />
                )}
              </div>

              <h3 className="text-xl font-bold text-gray-900">
                {journalError
                  ? "Erro ao gerar o jornal"
                  : journalDownloadUrl
                    ? "Jornal PDF pronto"
                    : "Gerando Jornal PDF"}
              </h3>

              <p className="mt-2 text-sm text-gray-500">
                {journalError
                  ? "A geração foi interrompida. Veja a mensagem abaixo."
                  : journalDownloadUrl
                    ? "Clique no botão abaixo para baixar o arquivo PDF."
                    : "A ferramenta vai gerar capa, páginas de cards com altura ajustada e anúncio final."}
              </p>
            </div>

            <div className="space-y-4">
              <div className="h-3 w-full overflow-hidden rounded-full bg-gray-100">
                <div
                  className={`h-full transition-all duration-500 ease-out ${
                    journalError
                      ? "bg-red-600"
                      : journalDownloadUrl
                        ? "bg-teal-600"
                        : "bg-blue-600"
                  }`}
                  style={{ width: `${journalProgress.step}%` }}
                />
              </div>

              <div className="flex items-center justify-between gap-4 text-sm">
                <span
                  className={`font-medium ${
                    journalError
                      ? "text-red-600"
                      : journalDownloadUrl
                        ? "text-teal-600"
                        : "text-blue-600"
                  }`}
                >
                  {journalError || journalProgress.message}
                </span>
                <span className="shrink-0 text-gray-400">{journalProgress.step}%</span>
              </div>

              {!journalError && !journalDownloadUrl && (
                <div className="rounded-xl bg-gray-50 p-3 text-xs leading-relaxed text-gray-500">
                  O PDF final será montado com páginas de até 1080x1920, sem sobras artificiais e com rodapé apenas no fim de cada categoria.
                </div>
              )}

              {journalDownloadUrl && !journalError && (
                <div className="space-y-3">
                  <a
                    href={journalDownloadUrl}
                    download={journalDownloadFileName}
                    className="flex h-11 w-full items-center justify-center rounded-xl bg-teal-600 text-sm font-bold text-white hover:bg-teal-700"
                  >
                    <Download className="mr-2 h-5 w-5" />
                    Baixar PDF
                  </a>

                  <Button
                    onClick={() => {
                      setIsGeneratingJournal(false);
                      setJournalDownloadUrl(null);
                      setJournalProgress({ step: 0, message: "" });
                    }}
                    className="h-11 w-full rounded-xl bg-gray-100 text-gray-700 hover:bg-gray-200"
                  >
                    Fechar
                  </Button>
                </div>
              )}

              {journalError && (
                <Button
                  onClick={() => {
                    setIsGeneratingJournal(false);
                    setJournalError(null);
                    setJournalProgress({ step: 0, message: "" });
                  }}
                  className="h-11 w-full rounded-xl bg-red-600 text-white hover:bg-red-700"
                >
                  Fechar
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const journalCss = `
  @font-face {
    font-family: 'Inter';
    src: url('/fonts/Inter-Regular.ttf') format('truetype');
    font-weight: 400;
  }
  @font-face {
    font-family: 'Inter';
    src: url('/fonts/Inter-Bold.ttf') format('truetype');
    font-weight: 700;
  }
  @font-face {
    font-family: 'Inter';
    src: url('/fonts/Inter-Black.ttf') format('truetype');
    font-weight: 900;
  }

  .journal-preview-viewport{
    width:100%;
    max-height:82vh;
    overflow:auto;
    display:flex;
    justify-content:center;
    align-items:flex-start;
    background:#ffffff;
    padding:24px;
    border-radius:24px;
    border:1px solid rgba(0,0,0,.10);
  }

  .journal-preview-scaler{
    width:324px;
    height:auto;
    min-height:576px;
    display:flex;
    justify-content:center;
    align-items:flex-start;
    flex-shrink:0;
    transform:scale(.30);
    transform-origin:top center;
  }

  .journal-root{
    width:1080px;
    margin:0 auto;
    background:#ffffff;
    color:#111;
    font-family:Inter,Arial,sans-serif;
  }

  .journal-page-label{
    width:1080px;
    height:46px;
    display:flex;
    align-items:center;
    justify-content:center;
    background:#ffffff;
    color:#111111;
    border:1px solid rgba(0,0,0,.12);
    border-bottom:0;
    font-size:18px;
    font-weight:900;
    letter-spacing:.04em;
    text-transform:uppercase;
  }

  .journal-page{
    position:relative;
    width:1080px;
    height:1920px;
    background:#ffffff;
    overflow:hidden;
    display:flex;
    align-items:center;
    justify-content:center;
    box-shadow:0 20px 50px rgba(0,0,0,.08);
    margin-bottom:40px;
  }

  .journal-cover-page,
  .journal-ad-page,
  .journal-header,
  .journal-card-wrap{
    cursor:pointer;
  }

  .journal-cover-page img,
  .journal-ad-page img{
    position:absolute;
    inset:0;
    width:100%;
    height:100%;
    object-fit:cover;
    z-index:2;
  }

  .journal-placeholder{
    position:absolute;
    inset:48px;
    border:3px dashed rgba(0,0,0,.35);
    display:flex;
    gap:20px;
    align-items:center;
    justify-content:center;
    text-align:center;
    font-size:34px;
    font-weight:900;
    color:#111;
    background:rgba(255,255,255,.72);
    z-index:1;
    pointer-events:none;
  }

  .journal-category-page{
    position:relative;
    width:1080px;
    height:auto;
    min-height:0;
    max-height:1920px;
    padding-bottom:40px;
    background:#ffffff;
    box-shadow:0 20px 50px rgba(0,0,0,.08);
    margin-bottom:40px;
    overflow:hidden;
  }

  .journal-header{
    position:relative;
    width:1080px;
    height:260px;
    background:#0b2341;
    color:#fff;
    display:flex;
    align-items:center;
    justify-content:center;
    font-size:38px;
    font-weight:900;
    overflow:hidden;
  }

  .journal-header img{
    position:absolute;
    inset:0;
    width:100%;
    height:100%;
    object-fit:cover;
    display:block;
    z-index:2;
  }

  .journal-header span{
    position:relative;
    z-index:1;
    pointer-events:none;
  }

  .journal-category-bar{
    width:calc(100% - 72px);
    margin:38px auto 24px auto;
    background:#0f6bc8;
    color:white;
    display:flex;
    align-items:center;
    justify-content:center;
    text-transform:uppercase;
    text-align:center;
    font-size:30px;
    line-height:1;
    font-weight:900;
    letter-spacing:.04em;
    padding:18px 36px;
    border-radius:999px;
    box-sizing:border-box;
  }

  .journal-grid{
    display:flex;
    flex-wrap:wrap;
    gap:28px;
    justify-content:center;
    align-content:flex-start;
    padding:20px 36px 36px 36px;
    box-sizing:border-box;
  }

  .journal-category-page.is-continuation .journal-grid{
    padding-top:54px;
  }

  .journal-card-wrap{
    position:relative;
    width:315px;
    height:476px;
    border-radius:22px;
    overflow:hidden;
    background:#fff;
    box-shadow:0 10px 20px rgba(0,0,0,.12);
  }

  .journal-card-shadow-host{
    display:block;
    width:700px;
    height:1058px;
    overflow:hidden;
    background:#fff;
    transform:scale(.45);
    transform-origin:top left;
  }

  .journal-footer-text{
    position:relative;
    left:auto;
    right:auto;
    bottom:auto;
    margin:12px 54px 0 54px;
    padding:18px 24px 0 24px;
    border-top:2px solid rgba(0,0,0,.16);
    text-align:center;
    font-size:16px;
    line-height:1.32;
    font-weight:500;
    outline:2px dashed transparent;
    color:#111;
  }

  .journal-footer-text:focus{
    outline-color:#0f6bc8;
    background:rgba(15,107,200,.06);
  }

  @media print{
    .journal-page-label{
      display:none;
    }
  }
`;

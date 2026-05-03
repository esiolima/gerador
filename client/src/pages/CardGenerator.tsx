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

function serializeJournalForPdf(journalElement: HTMLDivElement) {
  const clone = journalElement.cloneNode(true) as HTMLDivElement;

  const originalHosts = Array.from(
    journalElement.querySelectorAll(".journal-card-shadow-host")
  ) as HTMLDivElement[];

  const clonedHosts = Array.from(
    clone.querySelectorAll(".journal-card-shadow-host")
  ) as HTMLDivElement[];

  clonedHosts.forEach((clonedHost, index) => {
    const originalHost = originalHosts[index];
    const shadowHtml = originalHost?.shadowRoot?.innerHTML || "";

    // Usando template para compatibilidade máxima durante a serialização
    clonedHost.innerHTML = `
      <template shadowrootmode="open">
        ${shadowHtml}
      </template>
    `;
  });

  const activateDeclarativeShadowDom = `
    <script>
      // Método moderno e seguro para ativar Shadow DOM Declarativo
      document.querySelectorAll("template[shadowrootmode]").forEach(function(template) {
        var mode = template.getAttribute("shadowrootmode") || "open";
        var parent = template.parentNode;
        if (!parent || parent.shadowRoot) return;
        
        try {
          // Tenta usar o método moderno se disponível
          if (typeof parent.setHTMLUnsafe === 'function') {
            parent.setHTMLUnsafe(template.innerHTML);
          } else {
            // Fallback para navegadores que ainda não suportam setHTMLUnsafe
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

  return `${clone.outerHTML}${activateDeclarativeShadowDom}`;
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

  const socketRef = useRef<Socket | null>(null);
  const journalRef = useRef<HTMLDivElement>(null);

  const coverInputRef = useRef<HTMLInputElement>(null);
  const headerInputRef = useRef<HTMLInputElement>(null);
  const adInputRef = useRef<HTMLInputElement>(null);

  const [, setLocation] = useLocation();

  const generateCardsMutation = trpc.card.generateCards.useMutation();
  const groupedCards = useMemo(() => groupByCategory(result?.cards ?? []), [result]);

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
    setJournalProgress({ step: 5, message: "Iniciando geração do jornal diagramado..." });

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      controller.abort();
    }, 180000);

    let fakeProgressTimer: number | null = null;

    try {
      await new Promise((resolve) => window.setTimeout(resolve, 150));

      setJournalProgress({ step: 15, message: "Capturando as páginas do editor visual..." });
      const serializedJournal = serializeJournalForPdf(journalRef.current);

      setJournalProgress({ step: 30, message: "Montando HTML final do jornal..." });

      const journalHtml = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>${journalCss}</style>
</head>
<body>
  ${serializedJournal}
</body>
</html>`;

      setJournalProgress({ step: 45, message: "Enviando jornal para o servidor..." });

      fakeProgressTimer = window.setInterval(() => {
        setJournalProgress((current) => {
          if (current.step >= 92) {
            return {
              step: current.step,
              message: "Servidor ainda finalizando o PDF. Aguarde...",
            };
          }

          const nextStep = Math.min(current.step + 3, 92);

          let message = "Renderizando páginas no servidor...";

          if (nextStep >= 60) {
            message = "Convertendo páginas em PDF...";
          }

          if (nextStep >= 75) {
            message = "Aplicando imagens, cards e layout final...";
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
          html: journalHtml,
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

      if (!json?.pdfUrl) {
        throw new Error("PDF gerado, mas o servidor não retornou o link de download.");
      }

      setJournalProgress({ step: 100, message: "Concluído! Iniciando download..." });

      window.setTimeout(() => {
        window.location.href = json.pdfUrl;
        setIsGeneratingJournal(false);
      }, 900);
    } catch (err) {
      if (fakeProgressTimer) {
        window.clearInterval(fakeProgressTimer);
      }

      const message =
        err instanceof DOMException && err.name === "AbortError"
          ? "A geração do PDF demorou demais e foi interrompida. Tente novamente com menos cards ou imagens mais leves."
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
                    {progress.currentCard || `${progress.processed}/${progress.total}`}
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
                  imagens.
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
                    className="journal-page journal-cover"
                    onClick={() => coverInputRef.current?.click()}
                  >
                    <img src={coverImage} alt="Capa do jornal" />
                    <div className="journal-placeholder">
                      <Pencil className="h-8 w-8" />
                      Clique para escolher capa
                    </div>
                  </div>

                  <div className="journal-page-label">Página 2 — Cards</div>

                  <div className="journal-flow-page" style={{ background: pageBackground }}>
                    <div
                      className="journal-header"
                      onClick={() => headerInputRef.current?.click()}
                    >
                      <img src={headerImage} alt="Cabeçalho do jornal" />
                      <span>Cabeçalho</span>
                    </div>

                    {groupedCards.map(([category, cards]) => (
                      <section className="journal-category" key={category}>
                        <div className="journal-category-bar">{category}</div>

                        <div className="journal-grid">
                          {cards.map((card, index) => (
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
                      </section>
                    ))}

                    <div
                      className="journal-footer-text"
                      contentEditable
                      suppressContentEditableWarning
                      onBlur={(event) => setFooterText(event.currentTarget.innerText)}
                    >
                      {footerText}
                    </div>
                  </div>

                  <div className="journal-page-label">Página 3 — Anúncio</div>

                  <div
                    className="journal-page journal-cover"
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

      {/* Popup de Progresso do Jornal */}
      {isGeneratingJournal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl">
            <div className="mb-6 flex flex-col items-center text-center">
              <div
                className={`mb-4 flex h-16 w-16 items-center justify-center rounded-full ${
                  journalError ? "bg-red-50 text-red-600" : "bg-blue-50 text-blue-600"
                }`}
              >
                {journalError ? (
                  <AlertCircle className="h-8 w-8" />
                ) : (
                  <FileText className="h-8 w-8 animate-pulse" />
                )}
              </div>

              <h3 className="text-xl font-bold text-gray-900">
                {journalError ? "Erro ao gerar o jornal" : "Gerando Jornal PDF"}
              </h3>

              <p className="mt-2 text-sm text-gray-500">
                {journalError
                  ? "A geração foi interrompida. Veja a mensagem abaixo."
                  : "Acompanhe cada etapa da geração do PDF diagramado."}
              </p>
            </div>

            <div className="space-y-4">
              <div className="h-3 w-full overflow-hidden rounded-full bg-gray-100">
                <div
                  className={`h-full transition-all duration-500 ease-out ${
                    journalError ? "bg-red-600" : "bg-blue-600"
                  }`}
                  style={{ width: `${journalProgress.step}%` }}
                />
              </div>

              <div className="flex items-center justify-between gap-4 text-sm">
                <span
                  className={`font-medium ${
                    journalError ? "text-red-600" : "text-blue-600"
                  }`}
                >
                  {journalError || journalProgress.message}
                </span>
                <span className="shrink-0 text-gray-400">{journalProgress.step}%</span>
              </div>

              {!journalError && (
                <div className="rounded-xl bg-gray-50 p-3 text-xs leading-relaxed text-gray-500">
                  Se a mensagem continuar mudando, a ferramenta ainda está trabalhando.
                  Se aparecer erro aqui, o problema será exibido sem travar a tela.
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
    background:#f3f4f6; /* Cinza claro para o fundo do visualizador */
    padding:24px;
    border-radius:24px;
    border:1px solid rgba(0,0,0,.10);
  }

  .journal-preview-scaler{
    width:672px;
    height:auto;
    min-height:1200px;
    display:flex;
    justify-content:center;
    align-items:flex-start;
    flex-shrink:0;
    transform:scale(.28);
    transform-origin:top center;
  }

  .journal-root{
    width:2400px;
    margin:0 auto;
    background:#f3f4f6; /* Fundo cinza claro para a raiz do jornal */
    color:#111;
    font-family:Inter,Arial,sans-serif;
  }

  .journal-page-label{
    width:2400px;
    height:54px;
    display:flex;
    align-items:center;
    justify-content:center;
    background:#374151; /* Cinza escuro para a label da página */
    color:#ffffff;
    border-bottom:1px solid #1f2937;
    font-size:22px;
    font-weight:900;
    letter-spacing:.04em;
    text-transform:uppercase;
  }

  .journal-page{
    position:relative;
    width:2400px;
    height:4267px;
    background:#ffffff; /* Páginas brancas para contraste */
    overflow:hidden;
    display:flex;
    align-items:center;
    justify-content:center;
    page-break-after:always;
    box-shadow: 0 20px 50px rgba(0,0,0,0.05); /* Sombra suave nas páginas */
    margin-bottom: 40px;
  }

  .journal-cover,
  .journal-header,
  .journal-card-wrap{
    cursor:pointer;
  }

  .journal-cover img{
    position:absolute;
    inset:0;
    width:100%;
    height:100%;
    object-fit:cover;
    z-index:2;
  }

  .journal-placeholder{
    position:absolute;
    inset:80px;
    border:4px dashed rgba(0,0,0,.35);
    display:flex;
    gap:24px;
    align-items:center;
    justify-content:center;
    text-align:center;
    font-size:48px;
    font-weight:900;
    color:#111;
    background:rgba(255,255,255,.72);
    z-index:1;
    pointer-events:none;
  }

  .journal-flow-page{
    width:2400px;
    min-height:4267px;
    padding-bottom:90px;
    background:#ffffff; /* Fundo branco para a página de cards */
    page-break-after:always;
    box-shadow: 0 20px 50px rgba(0,0,0,0.05);
    margin-bottom: 40px;
  }

  .journal-header{
    position:relative;
    width:2400px;
    height:578px;
    background:#0b2341;
    color:#fff;
    display:flex;
    align-items:center;
    justify-content:center;
    font-size:54px;
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

  .journal-category{
    width:2400px;
  }

  .journal-category-bar{
    width:calc(100% - 160px);
    margin:70px auto 30px auto;
    background:#0f6bc8;
    color:white;
    display:flex;
    align-items:center;
    justify-content:center;
    text-transform:uppercase;
    text-align:center;
    font-size:52px;
    line-height:1;
    font-weight:900;
    letter-spacing:.04em;
    padding:24px 60px;
    border-radius:999px;
    box-sizing:border-box;
  }

  .journal-grid{
    display:flex;
    flex-wrap:wrap;
    gap:70px;
    justify-content:center;
    padding:30px 80px 70px 80px;
    box-sizing:border-box;
  }

  .journal-card-wrap{
    position:relative;
    width:700px;
    height:1058px;
    border-radius:48px;
    overflow:hidden;
    background:#fff;
    box-shadow:0 16px 32px rgba(0,0,0,.10);
  }

  .journal-card-shadow-host{
    display:block;
    width:700px;
    height:1058px;
    overflow:hidden;
    background:#fff;
  }

  .journal-footer-text{
    margin:30px 120px 0 120px;
    padding:24px 36px;
    border-top:2px solid rgba(255,255,255,.35);
    text-align:center;
    font-size:22px;
    line-height:1.32;
    font-weight:500;
    outline:2px dashed transparent;
    color:#fff;
  }

  .journal-footer-text:focus{
    outline-color:#0f6bc8;
    background:rgba(0,0,0,.18);
  }

  @media print{
    .journal-page-label{
      display:none;
    }
  }
`;

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
  categoriaSlug: string;
  texto: string;
  valor: string;
  cupom: string;
  logoFile: string;
  hasLogo: boolean;
  pdfName: string;
  pngName: string;
  htmlName: string;
  pdfUrl: string;
  pngUrl: string;
  htmlUrl: string;
};

type ProcessResult = {
  jobId: string;
  zipPath: string;
  fileName: string;
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
  const [adImage, setAdImage] = useState<string>("/assets/anuncio.png");
  const [pageBackground, setPageBackground] = useState<string>("#ffffff");
  const [footerText, setFooterText] = useState(
    "Ofertas válidas enquanto durarem os estoques. Consulte condições, disponibilidade e regulamento nos canais oficiais."
  );

  const [isGeneratingJournal, setIsGeneratingJournal] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const journalRef = useRef<HTMLDivElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const adInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const selectedLogoCardRef = useRef<string | null>(null);

  const [logoOverrides, setLogoOverrides] = useState<Record<string, string>>({});
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
    socket.on("progress", (data: ProgressData) => setProgress(data));
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

  const changeImage = async (kind: "cover" | "ad", file?: File | null) => {
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      window.alert("Envie apenas arquivos de imagem.");
      return;
    }

    const dataUrl = await readImageAsDataUrl(file);

    if (kind === "cover") setCoverImage(dataUrl);
    else setAdImage(dataUrl);
  };

  const openLogoPicker = (cardKey: string) => {
    selectedLogoCardRef.current = cardKey;
    logoInputRef.current?.click();
  };

  const changeLogo = async (file?: File | null) => {
    if (!file || !selectedLogoCardRef.current) return;

    if (!file.type.startsWith("image/")) {
      window.alert("Envie apenas arquivos de imagem.");
      return;
    }

    const dataUrl = await readImageAsDataUrl(file);

    setLogoOverrides((current) => ({
      ...current,
      [selectedLogoCardRef.current as string]: dataUrl,
    }));

    selectedLogoCardRef.current = null;
  };

  const generateJournalPdf = async () => {
    if (!journalRef.current || !result) return;

    setIsGeneratingJournal(true);

    try {
      const body = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>${journalCss}</style>
</head>
<body>
  ${journalRef.current.outerHTML}
</body>
</html>`;

      const response = await fetch("/api/journal/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ html: body, jobId: result.jobId }),
      });

      const json = await response.json();

      if (!response.ok) {
        throw new Error(json.error || "Erro ao gerar PDF do jornal.");
      }

      window.location.href = json.pdfUrl;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao gerar PDF do jornal.";
      setError(message);
      window.alert(message);
    } finally {
      setIsGeneratingJournal(false);
    }
  };

  const reset = () => {
    setFile(null);
    setResult(null);
    setProgress(null);
    setShowJournal(false);
    setError(null);
    setIsProcessing(false);
    setLogoOverrides({});
    setPageBackground("#ffffff");
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
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    handleFileSelect(e.dataTransfer.files[0]);
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
                    onChange={(e) => handleFileSelect(e.target.files?.[0])}
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
          </div>
        </section>

        {showJournal && result && (
          <section className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-white/10 bg-white/[0.06] p-5 backdrop-blur-xl">
              <div>
                <h2 className="text-2xl font-black">Editor visual do jornal</h2>
                <p className="text-sm text-white/45">
                  Cards em HTML, categorias separadas e logos clicáveis.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <label className="flex h-12 cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-4 text-sm font-bold text-white hover:bg-white/15">
                  <Palette className="h-5 w-5" />
                  Fundo
                  <input
                    type="color"
                    value={pageBackground}
                    onChange={(e) => setPageBackground(e.target.value)}
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

            <div className="overflow-auto rounded-3xl border border-white/10 bg-black/35 p-6">
              <div ref={journalRef} className="journal-root">
                <div className="journal-page-label">Página 1 — Capa</div>

                <div className="journal-page journal-cover" onClick={() => coverInputRef.current?.click()}>
                  <img src={coverImage} />
                  <div className="journal-placeholder">
                    <Pencil className="h-8 w-8" />
                    Clique para escolher capa 1080x1920
                  </div>
                </div>

                <div className="journal-page-label">Página 2 — Cards</div>

                <div className="journal-flow-page" style={{ background: pageBackground }}>
                  <div className="journal-header">
                    <img src="/assets/header.png" />
                    <span>Cabeçalho 1080x260</span>
                  </div>

                  {groupedCards.map(([category, cards]) => (
                    <section className="journal-category" key={category}>
                      <div className="journal-category-bar">{category}</div>

                      <div className="journal-grid">
                        {cards.map((card) => {
                          const cardKey = `${card.ordem}-${card.htmlName}`;
                          const logoOverride = logoOverrides[cardKey];

                          return (
                            <div className="journal-card-wrap" key={cardKey}>
                              <iframe
                                title={cardKey}
                                src={card.htmlUrl}
                                className="journal-card-frame"
                              />

                              <button
                                type="button"
                                className={`journal-logo-hotspot ${
                                  logoOverride || card.hasLogo ? "has-logo-override" : ""
                                }`}
                                onClick={() => openLogoPicker(cardKey)}
                              >
                                {logoOverride ? (
                                  <img src={logoOverride} alt="Logo substituído" />
                                ) : card.hasLogo ? (
                                  <span>Trocar logo</span>
                                ) : (
                                  <span>Adicionar logo</span>
                                )}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  ))}

                  <div
                    className="journal-footer-text"
                    contentEditable
                    suppressContentEditableWarning
                    onBlur={(e) => setFooterText(e.currentTarget.innerText)}
                  >
                    {footerText}
                  </div>
                </div>

                <div className="journal-page-label">Página 3 — Anúncio</div>

                <div className="journal-page journal-cover" onClick={() => adInputRef.current?.click()}>
                  <img src={adImage} />
                  <div className="journal-placeholder">
                    <Pencil className="h-8 w-8" />
                    Clique para escolher anúncio 1080x1920
                  </div>
                </div>
              </div>
            </div>

            <input
              ref={coverInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => changeImage("cover", e.target.files?.[0])}
            />

            <input
              ref={adInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => changeImage("ad", e.target.files?.[0])}
            />

            <input
              ref={logoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => changeLogo(e.target.files?.[0])}
            />
          </section>
        )}
      </main>

      <style>{journalCss}</style>
    </div>
  );
}

const journalCss = `
  .journal-root{
    width:1080px;
    margin:0 auto;
    background:#eef4ff;
    color:#111;
    font-family:Inter,Arial,sans-serif;
    transform-origin:top center;
  }

  .journal-page-label{
    width:1080px;
    height:54px;
    display:flex;
    align-items:center;
    justify-content:center;
    background:#000;
    color:#fff;
    font-size:22px;
    font-weight:900;
    letter-spacing:.04em;
    text-transform:uppercase;
  }

  .journal-page{
    position:relative;
    width:1080px;
    height:1920px;
    background:#f4f8ff;
    overflow:hidden;
    display:flex;
    align-items:center;
    justify-content:center;
    page-break-after:always;
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
    inset:40px;
    border:3px dashed rgba(0,0,0,.35);
    display:flex;
    gap:16px;
    align-items:center;
    justify-content:center;
    text-align:center;
    font-size:32px;
    font-weight:900;
    color:#111;
    background:rgba(255,255,255,.72);
    z-index:1;
  }

  .journal-flow-page{
    width:1080px;
    min-height:1920px;
    padding-bottom:48px;
    page-break-after:always;
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
    font-size:34px;
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
  }

  .journal-category{
    width:1080px;
  }

  .journal-category-bar{
    height:80px;
    width:1080px;
    background:#0f6bc8;
    color:white;
    display:flex;
    align-items:center;
    justify-content:center;
    text-transform:uppercase;
    font-size:38px;
    font-weight:900;
    letter-spacing:.04em;
  }

  .journal-grid{
    display:grid;
    grid-template-columns:repeat(3, 1fr);
    gap:30px;
    padding:30px;
    box-sizing:border-box;
  }

  .journal-card-wrap{
    position:relative;
    width:100%;
    aspect-ratio:700 / 1058;
    border-radius:20px;
    overflow:hidden;
    background:#fff;
    box-shadow:0 8px 20px rgba(0,0,0,.08);
  }

  .journal-card-frame{
    width:100%;
    height:100%;
    border:none;
    background:#fff;
    display:block;
  }

  .journal-logo-hotspot{
    position:absolute;
    left:22px;
    top:22px;
    width:86px;
    height:52px;
    border:1.5px dashed rgba(160,160,160,.7);
    border-radius:10px;
    background:rgba(238,238,238,.95);
    color:#888;
    font-size:9px;
    font-weight:800;
    display:flex;
    align-items:center;
    justify-content:center;
    text-align:center;
    padding:4px;
    cursor:pointer;
    overflow:hidden;
    z-index:5;
  }

  .journal-logo-hotspot:hover{
    border-color:#0f6bc8;
    color:#0f6bc8;
    background:#fff;
  }

  .journal-logo-hotspot img{
    width:100%;
    height:100%;
    object-fit:contain;
    display:block;
  }

  .journal-logo-hotspot.has-logo-override{
    background:rgba(255,255,255,.82);
  }

  .journal-footer-text{
    margin:14px 46px 0 46px;
    padding:14px 22px;
    border-top:1.5px solid rgba(255,255,255,.35);
    text-align:center;
    font-size:13px;
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

  @media screen and (max-width:1200px){
    .journal-root{
      transform:scale(.72);
      margin-bottom:-28%;
    }

    .journal-placeholder{
      font-size:28px;
    }
  }
`;

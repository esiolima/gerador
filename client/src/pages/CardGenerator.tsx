import { useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";

type GeneratedCard = {
  ordem: string;
  tipo: string;
  categoria: string;
  htmlUrl: string;
  htmlName: string;
  hasLogo: boolean;
};

type ProcessResult = {
  jobId: string;
  zipPath: string;
  cards: GeneratedCard[];
};

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
  const [result, setResult] = useState<ProcessResult | null>(null);
  const [showJournal, setShowJournal] = useState(false);

  const journalRef = useRef<HTMLDivElement>(null);

  const generateCardsMutation = trpc.card.generateCards.useMutation();
  const groupedCards = useMemo(() => groupByCategory(result?.cards ?? []), [result]);

  const handleUpload = async () => {
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    const upload = await fetch("/api/upload", {
      method: "POST",
      body: formData,
    });

    const json = await upload.json();

    const data = await generateCardsMutation.mutateAsync({
      filePath: json.filePath,
      sessionId: "session",
    });

    setResult(data);
  };

  const generatePDF = async () => {
    if (!journalRef.current) return;

    const html = `
<html>
<head>
<style>${journalCss}</style>
</head>
<body>
${journalRef.current.outerHTML}
</body>
</html>`;

    const res = await fetch("/api/journal/pdf", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ html }),
    });

    const data = await res.json();
    window.location.href = data.pdfUrl;
  };

  return (
    <div className="p-10 text-white">

      {!result && (
        <>
          <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          <Button onClick={handleUpload}>Processar</Button>
        </>
      )}

      {result && (
        <>
          <Button onClick={() => setShowJournal(true)}>Abrir Jornal</Button>
          <Button onClick={generatePDF}>Gerar PDF</Button>
        </>
      )}

      {showJournal && result && (
        <div className="preview-wrapper">
          <div ref={journalRef} className="journal-root">

            {groupedCards.map(([category, cards]) => (
              <div key={category}>

                <div className="category-bar">
                  {category}
                </div>

                <div className="grid">
                  {cards.map((card) => (
                    <div className="card-wrap" key={card.ordem}>

                      {/* 🔥 SCALE VISUAL CONTROLADO */}
                      <iframe
                        src={card.htmlUrl}
                        className="card-frame"
                      />

                      {!card.hasLogo && (
                        <div className="logo-placeholder">
                          Adicionar logo
                        </div>
                      )}

                    </div>
                  ))}
                </div>

              </div>
            ))}

          </div>
        </div>
      )}
    </div>
  );
}

const journalCss = `
.preview-wrapper{
  width:100%;
  overflow:auto;
  display:flex;
  justify-content:center;
}

/* 🔥 TAMANHO GRANDE */
.journal-root{
  width:2400px;
  background:#f4f8ff;
}

/* 🔥 TARJA AJUSTADA */
.category-bar{
  width:calc(100% - 240px);
  margin:50px auto 20px auto;
  background:#0f6bc8;
  color:#fff;
  text-align:center;
  font-weight:900;
  font-size:48px;
  padding:20px 40px;
  border-radius:999px;
}

/* 🔥 GRID */
.grid{
  display:grid;
  grid-template-columns:repeat(3, 1fr);
  gap:60px;
  padding:40px;
}

/* 🔥 CARD */
.card-wrap{
  position:relative;
  width:100%;
  height:1000px;
  display:flex;
  align-items:center;
  justify-content:center;
}

/* 🔥 ESCALA CONTROLADA */
.card-frame{
  width:700px;
  height:1058px;
  border:none;
  transform:scale(0.9);
  transform-origin:top center;
}

/* 🔥 LOGO BOX */
.logo-placeholder{
  position:absolute;
  top:40px;
  left:40px;
  width:120px;
  height:80px;
  border:2px dashed #bbb;
  background:#eee;
  display:flex;
  align-items:center;
  justify-content:center;
  font-size:12px;
  color:#666;
}
`;

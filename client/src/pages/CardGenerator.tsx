// client/src/pages/CardGenerator.tsx (VERSÃO FINAL CORRIGIDA)

import { useEffect, useMemo, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Upload,
  CheckCircle2,
  Download,
  Hourglass,
  Newspaper,
  FileDown,
  RefreshCcw,
  AlertCircle,
} from "lucide-react";

type GeneratedCard = {
  ordem: string;
  tipo: string;
  categoria: string;
  htmlUrl: string;
  hasLogo: boolean;
};

type ProcessResult = {
  jobId: string;
  zipPath: string;
  cards: GeneratedCard[];
  totalRows: number;
  processedRows: number;
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
  const [isProcessing, setIsProcessing] = useState(false);
  const [showJournal, setShowJournal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const journalRef = useRef<HTMLDivElement>(null);

  const generateCardsMutation = trpc.card.generateCards.useMutation();
  const groupedCards = useMemo(() => groupByCategory(result?.cards ?? []), [result]);

  const handleUpload = async () => {
    if (!file) return;

    setIsProcessing(true);
    setError(null);

    try {
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
    } catch (err) {
      setError("Erro ao processar");
    } finally {
      setIsProcessing(false);
    }
  };

  const generatePDF = async () => {
    if (!journalRef.current) return;

    const html = `
<html>
<head>
<style>${journalCss}</style>
</head>
<body>
${journalRef.current.innerHTML}
</body>
</html>`;

    const res = await fetch("/api/journal/pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
        <div ref={journalRef} className="journal-root">

          {groupedCards.map(([category, cards]) => (
            <div key={category}>
              <div className="category-bar">{category}</div>

              <div className="grid">
                {cards.map((card) => (
                  <div className="card-wrap" key={card.ordem}>

                    {/* 🔥 HTML REAL DO CARD */}
                    <iframe src={card.htmlUrl} className="card-frame" />

                    {/* 🔥 BOX LOGO */}
                    {!card.hasLogo && (
                      <div className="logo-placeholder">
                        Clique para adicionar logo
                      </div>
                    )}

                  </div>
                ))}
              </div>
            </div>
          ))}

        </div>
      )}
    </div>
  );
}

const journalCss = `
.journal-root{
  width:100%;
  background:white;
}

.category-bar{
  background:black;
  color:white;
  padding:20px;
  text-align:center;
  font-weight:900;
}

.grid{
  display:grid;
  grid-template-columns: repeat(3, 1fr);
  gap:20px;
  padding:20px;
}

.card-wrap{
  position:relative;
  background:white;
}

.card-frame{
  width:100%;
  height:500px;
  border:none;
}

.logo-placeholder{
  position:absolute;
  top:10px;
  left:10px;
  width:80px;
  height:50px;
  background:#eee;
  border:1px dashed #ccc;
  display:flex;
  align-items:center;
  justify-content:center;
  font-size:10px;
}
`;

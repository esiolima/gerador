import { useState, useRef, useEffect, useMemo } from "react";
import {
  Upload,
  AlertCircle,
  CheckCircle2,
  ArrowLeft,
  Sun,
  Moon,
  Trash2,
  HelpCircle,
  SortAsc,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";

interface Logo {
  name: string;
  path: string;
  mtime?: number;
}

type SortOption = "name" | "date";

export default function LogoManager() {
  const [, navigate] = useLocation();

  const [logos, setLogos] = useState<Logo[]>([]);
  const [sortBy, setSortBy] = useState<SortOption>("name");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isDark, setIsDark] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: logosData, refetch } = trpc.logo.listLogos.useQuery();

  useEffect(() => {
    if (logosData?.logos) {
      setLogos(logosData.logos);
    }
  }, [logosData]);

  const sortedLogos = useMemo(() => {
    const filtered = logos.filter((logo) => logo.name !== "blank.png");

    return [...filtered].sort((a, b) => {
      if (sortBy === "name") {
        return a.name.localeCompare(b.name);
      } else {
        return (b.mtime || 0) - (a.mtime || 0);
      }
    });
  }, [logos, sortBy]);

  const handleDelete = async (logoName: string) => {
    const confirmDelete = window.confirm(
      `Deseja realmente excluir "${logoName}"? Esta ação não pode ser desfeita.`
    );

    if (!confirmDelete) return;

    try {
      const response = await fetch(`/api/logos/${logoName}`, {
        method: "DELETE",
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setError(data?.error || "Erro ao excluir logo");
        return;
      }

      setSuccess(`Logo "${logoName}" excluída com sucesso!`);
      refetch();
    } catch {
      setError("Erro ao excluir logo");
    }
  };

  const handleFileSelect = async (file: File | null | undefined, overwrite = false) => {
    if (!file) return;

    const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/svg+xml"];
    if (!allowedTypes.includes(file.type)) {
      setError("Apenas PNG, JPG, JPEG, WEBP e SVG são permitidos");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError("O arquivo não pode exceder 5MB");
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const formData = new FormData();
      formData.append("logo", file); // 🔥 IMPORTANTE

      const response = await fetch("/api/upload-logo", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const err = await response.json().catch(() => null);
        throw new Error(err?.error || "Erro ao enviar logo");
      }

      setSuccess(`Logo "${file.name}" enviada com sucesso!`);
      refetch();

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao enviar logo");
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFileSelect(e.target.files?.[0]);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (isLoading) return;
    const droppedFile = e.dataTransfer.files[0];
    handleFileSelect(droppedFile);
  };

  return (
    <div className="min-h-screen bg-[#06111f] text-white p-6">
      <div className="max-w-5xl mx-auto space-y-8">

        <Button onClick={() => navigate("/")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar
        </Button>

        <h1 className="text-3xl font-black">Gerenciador de Logos</h1>

        {/* Upload */}
        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className="border-2 border-dashed border-white/20 p-10 text-center rounded-xl cursor-pointer"
        >
          <Upload className="mx-auto mb-4" />
          <p>Arraste ou clique para enviar logo</p>

          <input
            ref={fileInputRef}
            type="file"
            onChange={handleInputChange}
            className="hidden"
          />
        </div>

        {error && (
          <div className="bg-red-500/20 p-3 rounded">{error}</div>
        )}

        {success && (
          <div className="bg-green-500/20 p-3 rounded">{success}</div>
        )}

        {/* Logos */}
        <div className="grid grid-cols-3 gap-4">
          {sortedLogos.map((logo) => (
            <div key={logo.name} className="relative bg-white/5 p-4 rounded-xl">
              <button
                onClick={() => handleDelete(logo.name)}
                className="absolute top-2 right-2 text-red-400"
              >
                <Trash2 />
              </button>

              <img
                src={`/logos/${logo.name}`}
                className="w-full h-24 object-contain bg-white rounded"
              />

              <p className="text-xs mt-2">{logo.name}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

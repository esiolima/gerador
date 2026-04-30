import { useState, useRef, useEffect, useMemo } from "react";
import { Upload, AlertCircle, CheckCircle2, ArrowLeft, Sun, Moon, Trash2, HelpCircle, SortAsc, Clock } from "lucide-react";
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
    const filtered = logos.filter(logo => logo.name !== "blank.png");
    
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
      `Deseja realmente excluir "${logoName}"? Esta ação não pode ser desfeita e será sincronizada com o GitHub.`
    );

    if (!confirmDelete) return;

    try {
      const response = await fetch(`/api/logos/${logoName}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorData = await response.json();
        setError(errorData.error || "Erro ao excluir logo");
        return;
      }

      setSuccess(`Logo "${logoName}" excluída com sucesso! Sincronizando com GitHub...`);
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
      formData.append("file", file);

      const response = await fetch("/api/logo/upload", {
        method: "POST",
        headers: {
          'x-file-name': file.name,
          'x-overwrite': overwrite ? 'true' : 'false'
        },
        body: formData,
      });

      if (response.status === 409) {
        const confirmOverwrite = window.confirm(
          `O arquivo "${file.name}" já existe. Deseja substituí-lo pela nova versão?`
        );
        if (confirmOverwrite) {
          return handleFileSelect(file, true);
        } else {
          setIsLoading(false);
          return;
        }
      }

      if (!response.ok) {
        throw new Error("Erro ao enviar logo");
      }

      setSuccess(`Logo "${file.name}" ${overwrite ? 'substituída' : 'enviada'} com sucesso! Sincronizando com GitHub...`);
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

  const bgColor = isDark 
    ? "bg-gradient-to-br from-gray-900 via-blue-950 to-purple-950" 
    : "bg-gradient-to-br from-slate-100 via-blue-100 to-purple-100";
  const cardBg = isDark 
    ? "bg-white/10 backdrop-blur-lg border border-white/20" 
    : "bg-white/50 backdrop-blur-lg border border-white/80";
  const textPrimary = isDark ? "text-white" : "text-slate-900";
  const textSecondary = isDark ? "text-slate-300" : "text-slate-600";
  const uploadBg = isDark ? "bg-black/20" : "bg-white/30";
  const uploadBorder = isDragging
    ? (isDark ? 'border-cyan-300' : 'border-blue-600')
    : (isDark ? "border-white/30 hover:border-white/50" : "border-blue-300/80 hover:border-blue-400");

  return (
    <div className={`min-h-screen w-full py-12 px-4 sm:px-6 lg:px-8 transition-colors duration-500 ${bgColor}`}>
      <div className="max-w-6xl mx-auto space-y-8">
        
        <div className="flex items-center justify-between">
          <Button
            onClick={() => navigate("/")}
            variant="outline"
            className={`flex items-center gap-2 transition-all duration-300 ${
              isDark 
                ? 'bg-white/10 border-white/20 text-slate-200 hover:bg-white/20 hover:text-white' 
                : 'bg-black/5 border-slate-400/50 text-slate-700 hover:bg-black/10'
            }`}
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar para Home
          </Button>

          <div className="flex items-center gap-4">
            <div className={`hidden md:flex items-center gap-2 px-4 py-2 rounded-full text-xs font-medium ${isDark ? 'bg-blue-500/20 text-blue-300' : 'bg-blue-100 text-blue-700'}`}>
              <HelpCircle className="w-4 h-4" />
              Dica: O sistema aceita PNG, JPG, WEBP e SVG
            </div>
            <button
              onClick={() => setIsDark(!isDark)}
              className={`p-3 rounded-full transition-all duration-300 backdrop-blur-sm ${
                isDark 
                  ? "bg-white/10 hover:bg-white/20 text-yellow-400" 
                  : "bg-black/10 hover:bg-black/20 text-slate-700"
              }`}
            >
              {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
          </div>
        </div>

        <div className={`p-8 rounded-2xl shadow-2xl ${cardBg}`}>
          <h2 className={`text-2xl font-bold ${textPrimary} mb-4`}>
            Gerenciador de Logos
          </h2>

          <div
            onClick={() => !isLoading && fileInputRef.current?.click()}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-all duration-300 ${uploadBorder} ${uploadBg} ${isLoading ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}`}
          >
            <div className="flex flex-col items-center space-y-3 pointer-events-none">
              <Upload className={`w-12 h-12 mx-auto mb-4 ${isDark ? 'text-slate-400' : 'text-slate-700'}`} />
              <p className={`${textSecondary} mb-4`}>
                Arraste ou clique para selecionar um arquivo
              </p>
              <Button
                asChild
                disabled={isLoading}
                className={`text-white font-semibold transition-all duration-300 ${isDark ? 'bg-cyan-500/80 hover:bg-cyan-500' : 'bg-blue-600 hover:bg-blue-700'}`}
              >
                <span>{isLoading ? "Enviando..." : "Selecionar Logo"}</span>
              </Button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml"
              onChange={handleInputChange}
              className="hidden"
              disabled={isLoading}
            />
          </div>

          {error && (
            <div className={`flex items-center gap-2 p-4 mt-4 rounded-lg ${isDark ? 'bg-red-500/20 border border-red-400/50 text-red-300' : 'bg-red-500/10 border border-red-500/20 text-red-700'}`}>
              <AlertCircle className="w-5 h-5" />
              {error}
            </div>
          )}

          {success && (
            <div className={`flex items-center gap-2 p-4 mt-4 rounded-lg ${isDark ? 'bg-green-500/20 border border-green-400/50 text-green-300' : 'bg-green-500/10 border border-green-500/20 text-green-700'}`}>
              <CheckCircle2 className="w-5 h-5" />
              {success}
            </div>
          )}
        </div>

        <div className={`p-8 rounded-2xl shadow-2xl ${cardBg}`}>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
            <h3 className={`text-xl font-bold ${textPrimary}`}>
              Logos Disponíveis
            </h3>
            
            <div className="flex items-center gap-2 bg-black/10 p-1 rounded-lg">
              <button
                onClick={() => setSortBy("name")}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${sortBy === "name" ? (isDark ? 'bg-white/10 text-white' : 'bg-white text-slate-900 shadow-sm') : (isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-700')}`}
              >
                <SortAsc className="w-3.5 h-3.5" />
                A-Z
              </button>
              <button
                onClick={() => setSortBy("date")}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${sortBy === "date" ? (isDark ? 'bg-white/10 text-white' : 'bg-white text-slate-900 shadow-sm') : (isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-700')}`}
              >
                <Clock className="w-3.5 h-3.5" />
                Recentes
              </button>
            </div>
          </div>

          {sortedLogos.length === 0 ? (
            <div className="text-center py-12">
              <p className={textSecondary}>Nenhum logo disponível na pasta /logos</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
              {sortedLogos.map((logo) => (
                <div
                  key={logo.name}
                  className={`relative rounded-xl p-4 transition-all duration-300 border group flex flex-col items-center ${isDark ? 'bg-black/20 border-white/10 hover:bg-black/40 hover:border-white/30' : 'bg-white/40 border-slate-200 hover:bg-white/60 hover:border-blue-300'}`}
                >
                  <button
                    onClick={() => handleDelete(logo.name)}
                    title="Excluir logo"
                    className="absolute top-2 right-2 p-2 rounded-full bg-red-500/10 text-red-500 opacity-0 group-hover:opacity-100 hover:bg-red-500 hover:text-white transition-all duration-200 z-10"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>

                  {/* 🔥 FUNDO BRANCO ADICIONADO AQUI PARA MELHOR VISUALIZAÇÃO */}
                  <div className="w-full h-32 flex items-center justify-center mb-3 bg-white rounded-lg overflow-hidden shadow-inner">
                    <img
                      src={`/logos/${logo.name}`}
                      alt={logo.name}
                      className="max-w-full max-h-full object-contain p-2"
                      onError={(e) => { (e.target as HTMLImageElement).src = "/logos/blank.png"; }}
                    />
                  </div>
                  
                  <div className="w-full text-center">
                    <p className={`text-xs font-medium truncate w-full px-1 ${textPrimary}`} title={logo.name}>
                      {logo.name}
                    </p>
                    <div className="flex items-center justify-center gap-2 mt-1">
                      <p className={`text-[10px] uppercase ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                        {logo.name.split('.').pop()}
                      </p>
                      {logo.mtime && (
                        <span className={`text-[10px] ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>
                          • {new Date(logo.mtime).toLocaleDateString('pt-BR')}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

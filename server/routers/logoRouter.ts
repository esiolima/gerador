import { publicProcedure, router } from "../_core/trpc";
import path from "path";
import fs from "fs";
import { z } from "zod";
import { TRPCError } from "@trpc/server";

const LOGOS_DIR = path.resolve("logos");

// Ensure logos directory exists
if (!fs.existsSync(LOGOS_DIR)) {
  fs.mkdirSync(LOGOS_DIR, { recursive: true });
}

export const logoRouter = router({
  // List all logos with metadata
  listLogos: publicProcedure.query(async () => {
    try {
      const files = fs.readdirSync(LOGOS_DIR);
      const logos = files
        .filter((file) => {
          const ext = path.extname(file).toLowerCase();
          return [".png", ".jpg", ".jpeg", ".webp", ".svg"].includes(ext);
        })
        .map((name) => {
          const filePath = path.join(LOGOS_DIR, name);
          const stats = fs.statSync(filePath);
          return {
            name,
            path: `/logos/${name}`,
            mtime: stats.mtime.getTime(), // Data de modificação para ordenação
          };
        });

      return { logos };
    } catch (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Erro ao listar logos",
      });
    }
  }),

  // Delete a logo
  deleteLogo: publicProcedure
    .input(
      z.object({
        logoName: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const { logoName } = input;

      // Validate filename to prevent directory traversal
      if (logoName.includes("..") || logoName.includes("/")) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Nome de arquivo inválido",
        });
      }

      // Don't allow deleting blank.png
      if (logoName === "blank.png") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Não é possível deletar o logo padrão",
        });
      }

      const filePath = path.join(LOGOS_DIR, logoName);

      // Verify file is within logos directory
      if (!path.resolve(filePath).startsWith(LOGOS_DIR)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Acesso negado",
        });
      }

      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }

        return { success: true };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Erro ao deletar logo",
        });
      }
    }),
});

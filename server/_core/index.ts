import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import path from "path";
import fs from "fs";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { Server as SocketIOServer } from "socket.io";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { setupUploadRoute } from "../uploadHandler";
import { setupLogoUploadRoute } from "../logoUploadHandler";
import { setupJournalRoute } from "../journalHandler";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  // Configuração do CORS para Socket.io
  const io = new SocketIOServer(server, {
    cors: {
      origin: process.env.SOCKET_CORS_ORIGIN || true
      methods: ["GET", "POST"],
    },
  });

  // Configure body parser com limite maior para uploads de arquivos
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // Registra rotas OAuth
  registerOAuthRoutes(app);

  // Configuração do tRPC com Socket.io context
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext: async (opts) => createContext(opts, io),
    })
  );

  // Conexão com o Socket.io
  io.on("connection", (socket) => {
    console.log(`Client connected: ${socket.id}`);

    socket.on("join", (sessionId: string) => {
      socket.join(sessionId);
      console.log(`Client ${socket.id} joined session ${sessionId}`);
    });

    socket.on("disconnect", () => {
      console.log(`Client disconnected: ${socket.id}`);
    });
  });

  // Configuração de rota de upload
  setupUploadRoute(app);
  setupLogoUploadRoute(app);
  setupJournalRoute(app);
  app.use("/output", express.static(path.resolve("output")));
  app.use("/assets", express.static(path.resolve("assets")));

  // Modo de desenvolvimento usa Vite, produção usa arquivos estáticos
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // Limpeza de arquivos antigos na inicialização
  const uploadsDir = path.resolve("uploads");
  const outputDir = path.resolve("output");
  const tmpDir = path.resolve("tmp");

  for (const dir of [uploadsDir, outputDir, tmpDir]) {
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        try {
          fs.unlinkSync(path.join(dir, file));
        } catch (e) {
          // Ignorar erros de limpeza
        }
      }
    }
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
    console.log(`Socket.io ready for real-time updates`);
  });
}

startServer().catch(console.error);

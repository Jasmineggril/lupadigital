/**
 * @file routes/index.ts
 * @description Roteador raiz da API — agrega todos os sub-roteadores na ordem correta.
 *
 * Ordem importa:
 *   1. healthRouter    — GET /health (sem auth, deve responder sempre)
 *   2. editalRouter    — rotas de editais com auth opcional por endpoint
 *   3. niasciRouter    — rotas NIASci (Lattes, Artigos, Projetos, Planetário, Chat)
 *                        ANTES do resourcesRouter, pois este tem requireAuth global
 *                        e as rotas NIASci têm sua própria lógica de autenticação
 *   4. resourcesRouter — CRUD genérico com requireAuth aplicado globalmente
 */

import { Router, type IRouter } from "express";
import healthRouter from "./health";
import editalRouter from "./edital";
import resourcesRouter from "./resources";
import niasciRouter from "./niasci";

const router: IRouter = Router();

router.use(healthRouter);
router.use(editalRouter);
router.use(niasciRouter);   // antes do resourcesRouter (que tem requireAuth global)
router.use(resourcesRouter);

export default router;

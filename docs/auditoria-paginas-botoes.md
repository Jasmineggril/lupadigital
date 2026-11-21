# Auditoria de páginas e botões (novembro de 2026)

Ferramenta: `scripts/auditoria-botoes.mjs` (Playwright, Chromium headless) sobre a API real com banco de testes
e auth de teste. Para cada rota e papel (visitante, usuário, administrador): erros de JavaScript, requisições
com falha, links para rotas inexistentes, rolagem horizontal a 390 px e **clique em cada botão visível numa
carga nova da página**, registrando o efeito (navegação, mudança na página, requisição, diálogo, download).
Ações destrutivas ou externas (excluir, sair, revogar, aprovar, coletar…) são listadas, não clicadas.

## Cobertura

45 combinações de rota × papel (todas as rotas de `App.tsx`, incluindo `:id` com dados reais de teste).

## Achados e correções

| Página | Achado | Correção |
|---|---|---|
| Ferramentas NIASci (`/niasci/*`) | `GET /api/resources/*` respondia **500** quando o banco não responde; sem modo de teste | 503 com mensagem ("Nada foi alterado"); modo memória só para testes; teste de isolamento entre usuários |
| `/compartilhado/:token` | "Copiar link" sem nenhum retorno (falha silenciosa) | Mensagem "Link copiado" ou orientação se falhar; validade do link exibida |
| `/niasci/assistente` | Botão de envio sem nome acessível; sugestão pedia "editais do CNPq abertos" (o Assistente não tem esses dados) | `aria-label`; sugestão trocada por pergunta que ele pode responder |
| `/participar/:id` | "Acrescentar" sem efeito com campo vazio | Desabilitado até haver texto |
| `/niasci/projetos`, `/niasci/planetario` | Abas e seleção de público sem estado para leitor de tela | `aria-pressed` |
| 7 páginas | Botão dentro de link (dois elementos interativos aninhados) | Link com estilo de botão |
| Rodapé | Diálogo "Como funciona" com passos desatualizados; botão ficou invisível na 1ª correção | Link para `/como-funciona`, conferido em captura |
| `/dashboard`, `/timeline` | Estado vazio sem caminho clicável | Link "Analisar um edital" |
| 404 | Em inglês, com mensagem de desenvolvedor | Página em português com caminhos reais |
| Sobre, Tecnologias, Impacto, FAQ, Como funciona, Contato | Conteúdo desatualizado ou falso (Drizzle/OpenAI; histórico "cai no navegador"; LinkedIn genérico; passos antigos) | Reescritas no padrão do DESIGN.md |
| Hub NIASci | Mesma lista 3× e cores por módulo | Catálogo único, "você fornece / você recebe / pede conta" |
| Ferramentas NIASci | Cor própria por módulo (âmbar, violeta, ciano, verde) e texto âmbar-500 com contraste baixo | Cor da identidade (lens) |

## Itens marcados como "sem efeito" que são corretos

- Aba ou filtro já selecionado ("Colar Texto", "Todos", "Gerar com IA", público "Geral").
- `/historico`: os botões atrás do painel aberto não recebem clique (o painel está sobre a página).
- Contato com campos vazios: a validação do navegador impede o envio.

## Resultado final

- Sem requisições com falha, erros de JavaScript, links quebrados ou rolagem horizontal a 390 px.
- axe-core (WCAG 2.x A/AA): 0 violações em 20 páginas públicas e nas logadas das jornadas.
- E2E: jornadas 11/11, /testar 17/17, docente 23/23; API 389/389.

Limites: emulação no Chromium (não aparelho físico); chamadas reais à IA não são feitas nesta auditoria.

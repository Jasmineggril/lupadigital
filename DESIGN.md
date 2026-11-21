# DESIGN.md — LUPA Digital

> Sistema visual da LUPA Digital (NIASci/UnDF). Leia antes de criar ou alterar qualquer tela.
> Estrutura inspirada no formato DESIGN.md (VoltAgent/awesome-design-md), com uma direção única,
> adaptada à identidade da LUPA, sem misturar estilos de outras marcas.

## 1. Tema visual e atmosfera

**A LUPA é uma mesa de leitura de documentos oficiais.** Quem usa são docentes e pesquisadores da UnDF
procurando editais (FAPDF primeiro) e tentando saber, com segurança, se podem participar.

- **Sensação:** sala de leitura de uma boa biblioteca pública, com a cópia anotada de um revisor cuidadoso.
  Calma, precisa e confiável. Nada de "tecnologia futurista".
- **Assinatura: a marcação de evidência.** Todo dado extraído de um edital aparece com o trecho oficial,
  como se tivesse sido grifado com marca-texto, e com a fonte em fonte monoespaçada. É o único elemento
  "expressivo" do sistema. O resto fica quieto para não competir com ele.
- **Duas densidades:**
  - **Apresentação** (início, cadastro, login, recuperação): mais respiro, tipografia de display, uma
    peça visual forte por tela.
  - **Trabalho** (catálogo, detalhe, perfil, recomendações, admin): leitura e produtividade primeiro.
    Superfícies planas, linhas finas, hierarquia por tipografia, nunca por decoração.
- **O que a LUPA não é:** não usa roxo/lilás, gradientes vistosos, glassmorphism, ilustrações genéricas
  de "IA", números inventados, depoimentos ou selos que não existem.

## 2. Paleta e papéis

Todas as combinações de texto abaixo passam WCAG AA (contraste ≥ 4,5:1). Valores verificados.

| Token | Hex | Papel | Contraste |
|---|---|---|---|
| `ink` | `#10263D` | Texto principal, títulos, faixa escura da marca | 15,4:1 sobre branco |
| `ink-2` | `#3B4E63` | Texto secundário, corpo longo em cartões | 8,6:1 |
| `muted` | `#5A6B7B` | Legendas, metadados, rótulos auxiliares | 5,5:1 (5,1:1 sobre `paper`) |
| `paper` | `#F4F6F7` | Fundo das telas de trabalho | — |
| `surface` | `#FFFFFF` | Cartões, formulários, painéis | — |
| `hairline` | `#DCE3E8` | Divisores e bordas de cartão (decorativas) | — |
| `field` | `#7D8C9B` | Borda de campos de formulário (componente de interface) | 3,4:1 (≥ 3:1) |
| `lens` | `#0B6E78` | **Cor de ação**: botões primários, links, foco, item ativo | 6,0:1 |
| `lens-deep` | `#095A62` | Hover/pressionado da ação | 7,9:1 |
| `lens-tint` | `#E5F2F3` | Fundo de destaque leve, item selecionado | texto `lens` 5,2:1 |
| `marker` | `#FFE58A` | **Só** para marcar evidência e termos encontrados | texto `ink` 12,3:1 |
| `success` / tint | `#1E7A4B` / `#E8F4ED` | Requisito atendido, coleta concluída | 4,7:1 |
| `warning` / tint | `#8A5300` / `#FFF3D6` | Pendente, não confirmado, atenção | 5,7:1 |
| `danger` / tint | `#B3261E` / `#FDECEA` | Impedimento, erro, falha | 5,7:1 |

Regras de uso:

- **Uma cor de ação só:** `lens`. Links e botões primários usam `lens`; não há segunda cor "de destaque".
- **`marker` é semântico:** só aparece sobre evidência (trecho do edital) e termo encontrado no perfil. Nunca
  como fundo decorativo.
- **Estado nunca só por cor:** sempre ícone + texto ("Não atendida", "Pendente").
- **Faixa da marca:** `ink` como fundo só no rodapé e no painel lateral do login/cadastro.

## 3. Tipografia

| Papel | Família | Uso |
|---|---|---|
| Display | **Bricolage Grotesque** (600/700) | Títulos de apresentação (h1 da início, login, cadastro) e títulos de página. Com moderação. |
| Texto e interface | **Public Sans** (400/500/600/700) | Todo o resto. Família criada para serviços públicos: legível, neutra, institucional. |
| Dados | **IBM Plex Mono** (400/500) | Número do edital, datas, versões, fontes/URLs, índices, eyebrows. |

Escala (rem a partir de 16 px):

| Nome | Tamanho / altura / peso | Observação |
|---|---|---|
| `display` | 3.25rem (52) / 1.05 / 700, `-0.02em` | Só h1 da página inicial. Celular: 2.25rem. |
| `h1` | 2.25rem (36) / 1.1 / 700 | Título de página. Celular: 1.75rem. |
| `h2` | 1.5rem (24) / 1.25 / 650 | Seções. |
| `h3` | 1.125rem (18) / 1.35 / 600 | Títulos de cartão. |
| `body` | 1rem (16) / 1.6 / 400 | Corpo. Medida máxima de 70ch. |
| `small` | 0.875rem (14) / 1.5 / 400 | Texto de cartão, ajuda de campo. |
| `caption` | 0.8125rem (13) / 1.4 / 400 | Metadados. Nunca abaixo de 12 px. |
| `eyebrow` | 0.75rem (12) / 1.3 / 500 Plex Mono, MAIÚSCULAS, `+0.08em` | Rótulo acima do título; codifica a seção real. |

- `text-wrap: balance` em títulos; `text-wrap: pretty` em parágrafos.
- `font-variant-numeric: tabular-nums` em datas, contagens, tabelas e índices.
- Reticências tipográficas (`…`) e aspas curvas (“ ”) no texto da interface.

## 4. Componentes

**Botões** (raio 8 px, altura 44 px padrão, 36 px compacto):

| Variante | Repouso | Hover | Foco | Desabilitado |
|---|---|---|---|---|
| Primário | fundo `lens`, texto branco | `lens-deep` | anel 2 px `lens` + 2 px de afastamento | 50% opacidade, cursor proibido |
| Secundário | branco, borda `field`, texto `ink` | fundo `paper`, borda `ink-2` | anel | idem |
| Fantasma | transparente, texto `lens` | fundo `lens-tint` | anel | idem |
| Perigo | fundo `danger` | mais escuro | anel | idem |

- Rótulo = verbo + objeto ("Salvar perfil", "Executar coleta agora"). No máximo duas ações na dobra.
- Em envio: o botão continua no lugar, mostra spinner e o rótulo vira gerúndio com reticências
  ("Salvando…"). Envio duplicado é bloqueado.

**Campos:** altura 44 px, raio 8 px, borda `field`, fundo branco. Foco: borda `lens` + anel `lens` 25%.
Erro: borda `danger`, mensagem abaixo do campo com ícone, ligada por `aria-describedby`; ao enviar, o foco
vai para o primeiro campo com erro. Rótulo sempre visível, acima do campo (nunca só placeholder).
Placeholder mostra um exemplo e termina com "…". `autocomplete`, `type` e `inputmode` corretos;
`spellCheck={false}` em e-mail e identificadores.

**Cartões:** branco, borda `hairline` 1 px, raio 12 px, padding 20–24 px, sem sombra em repouso. Cartão
clicável: borda `ink-2` 30% no hover (sem "levantar").

**Evidência (assinatura):** bloco com barra lateral `marker` de 3 px, texto do trecho em `ink-2`, termo
encontrado com fundo `marker` e linha de fonte em Plex Mono (`Fonte · fap.df.gov.br/…`).

**Selos de estado:** pílula (raio total), 12–13 px, peso 600, ícone + texto.

- Situação: Aberta (`success`), Encerrada (`muted`), Suspensa/Cancelada (`danger`), Não confirmada
  (`warning`).
- Elegibilidade: Sem impedimento / Pendente / Impedimento.

**Navegação:** barra superior branca com linha `hairline`; item ativo em `lens` com sublinhado de 2 px.
"Pular para o conteúdo" é o primeiro foco. Sino de avisos com contador e `aria-label` com a contagem.

**Estados de tela:** cada lista tem quatro estados:
- **carregando:** esqueleto ou "Carregando…" com `aria-busy`;
- **vazio:** diz o que fazer a seguir;
- **erro:** diz o que houve, com "Tentar novamente";
- **atualizando:** mantém os dados na tela e sinaliza com `aria-busy`.

## 5. Layout e espaçamento

- **Base 4 px.** Escala: 4, 8, 12, 16, 20, 24, 32, 48, 64, 96.
- **Larguras:** apresentação até 1200 px; telas de trabalho até 1152 px; formulários de perfil até 880 px;
  formulários de conta até 440 px.
- **Margens laterais iguais** nos dois lados: 16 px no celular, 24 px no tablet, 32 px no desktop.
- **Seções de apresentação:** 64–96 px verticais; **trabalho:** 24–32 px entre blocos.
- **Página inicial:** uma ideia por tela, hero sozinho na primeira dobra.

## 6. Profundidade e elevação

Sistema **plano**: hierarquia por linhas finas (`hairline`) e fundo (`paper` × `surface`).

| Nível | Uso | Valor |
|---|---|---|
| 0 | Cartões, painéis | sem sombra, borda `hairline` |
| 1 | Barra fixa (topo, salvar perfil) | `0 1px 0 #DCE3E8` |
| 2 | Menus, popovers | `0 8px 24px rgba(16,38,61,.12)` |

## 7. Movimento

- Só `transform` e `opacity`, 150–200 ms, `ease-out`. Nunca `transition: all`.
- Sem animação ao rolar, parallax, carrossel ou abas automáticas.
- `prefers-reduced-motion: reduce` desliga todas as transições.

## 8. Faça e não faça

| Faça | Não faça |
|---|---|
| Mostrar o trecho oficial e a fonte de cada informação extraída | Afirmar data, valor ou requisito sem evidência |
| Rotular o índice como "aderência", não chance de aprovação | Mostrar porcentagens com precisão que o cálculo não tem |
| Dizer "não encontrado — confira no documento oficial" | Esconder campos ausentes |
| Estado = ícone + texto + cor | Estado só por cor |
| Uma ação primária por bloco | Vários botões primários lado a lado |
| Exemplo ilustrativo marcado como tal | Dados fictícios parecendo reais |

## 9. Comportamento responsivo

| Faixa | Comportamento |
|---|---|
| < 640 px (celular) | Uma coluna; botões principais com largura total; filtros empilhados; menu em gaveta; alvo de toque ≥ 44 px |
| 640–1023 px | Duas colunas em listas de cartões; formulários em uma coluna |
| ≥ 1024 px | Detalhe do edital em 2 colunas (conteúdo + compatibilidade fixa ao rolar); filtros em linha |
| ≥ 1280 px | Navegação completa no topo |

Sem rolagem horizontal em 320 px. Tabelas largas (admin) rolam dentro do próprio contêiner. Sem
`user-scalable=no`.

## 10. Guia rápido para agentes

- Ação/link/foco: `lens #0B6E78`. Texto: `ink #10263D`. Fundo de trabalho: `paper #F4F6F7`.
  Evidência: `marker #FFE58A`.
- Títulos: Bricolage Grotesque. Texto: Public Sans. Números/fontes: IBM Plex Mono.
- Raios: campos e botões 8 px, cartões 12 px, selos 999 px.
- Sem sombra em cartões; borda `#DCE3E8`. Campos com borda `#7D8C9B`.
- Classes utilitárias do projeto: `font-display`, `font-mono`, `eyebrow`, `evidence`, `mark-term`,
  `tabular`.
- Antes de entregar: revise com as Web Interface Guidelines (foco visível, rótulos, erros inline,
  `aria-live`, estados de carregamento, sem rolagem horizontal, `prefers-reduced-motion`).

## Decisões da evolução integrada (novembro de 2026)

- **Entrada por objetivo** (“O que você quer fazer?”): cartões simples com rótulo, o que a pessoa recebe e o destino real; “pede conta” escrito antes do clique. O catálogo vem de `@workspace/feature-catalog` (única fonte — a mesma usada pelo Assistente).
- **Espaço de participação**: duas colunas no desktop (trabalho à esquerda; situação, conferência e próximos passos fixos à direita); uma coluna no celular, com a mesma ordem de prioridade. Origem dos itens em texto (“do edital”, “da análise”, “seu”), trecho em `<details>`.
- **Conferência**: ícone + palavra + cor (nunca só cor), tons já existentes (`emerald`, `amber`, `red`, neutro).
- **Mudanças do edital**: bloco âmbar com “Antes / Agora / afeta”, e ação explícita para atualizar — nada muda sozinho.
- **Perfil essencial**: “Para começar” no topo, seis perguntas com “por que perguntamos”, todas opcionais.
- **Texto auxiliar**: `text-muted-foreground` sem opacidade (5,5:1). Nunca reduzir contraste com `opacity` em texto.
- **Botões de salvar** que podem ficar inativos usam `aria-disabled` para não tirar o foco do teclado.
- **Itens de menu**: o menu principal não ganha novos itens sem caber em 1280 px sem quebrar linha; “Minhas participações” fica no menu da conta.

# Acessibilidade (meta WCAG 2.2 AA) e responsividade — relatório

> Meta técnica, não declaração de conformidade. Ferramentas automáticas detectam uma parte dos problemas;
> faltam testes com leitor de tela e com pessoas com deficiência (ver pendências).

## Ferramentas e ambiente

| Ferramenta | Versão | Ambiente |
|---|---|---|
| axe-core | 4.10.2 — regras `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa` | Chromium headless (Playwright), build de produção servido localmente, API de testes |
| Playwright | pré-instalado no ambiente | Emulação de tamanhos de tela (**não** é teste em aparelho físico) |

## Resultado automático

| Escopo | Páginas | Violações encontradas | Depois das correções |
|---|---|---|---|
| Públicas | `/`, `/testar`, `/historico`, `/contato`, `/aprender`, `/glossario`, `/oportunidades`, `/como-funciona`, `/faq`, `/tecnologias`, `/sobre`, `/impacto-social`, `/login`, `/cadastro`, `/esqueci-senha`, `/privacidade`, `/niasci`, `/compartilhado/:token` | contraste (texto auxiliar com `opacity: .95` → 4,3–4,46:1; título escuro sobre faixa teal em `/sobre` → 2,58:1; texto cinza sobre fundo tingido em `/impacto-social` → 4,32:1; “Carregando…” → 4,46:1); botão de ícone sem nome (fechar e excluir no histórico); lista de definição inválida no glossário (30 termos) | **0** |
| Logadas | `/inicio`, `/perfil`, `/participar`, `/participar/:id`, `/configuracoes`, `/oportunidades`, `/testar` | contraste (mesma causa) | **0** |

Correções: `index.css` (remove a opacidade; o token `muted` volta a 5,5:1, como no DESIGN.md), `App.tsx`, `sobre.tsx`, `impacto-social.tsx`, `glossario.tsx`, `testar.tsx`.

## Verificações por teclado (automatizadas no E2E)

- Marcar documento com **Espaço** e salvar com **Enter** em `/participar/:id`.
- O foco **permanece** no botão depois de salvar (antes o botão se desabilitava e o foco se perdia; agora `aria-disabled`).
- Diálogos do `/testar` fecham com **Esc** (E2E-T); link “pular para o conteúdo” e foco visível (E2E-D).

## Outras decisões de acessibilidade desta etapa

- Perguntas do perfil com `fieldset/legend`, explicação “por que perguntamos” e alvos ≥ 44 px de altura.
- Origem dos itens (do edital / da análise / seu) escrita em texto, não só por cor; níveis da conferência com ícone + palavra (“OK”, “Atenção”, “Impede”, “Não confirmado”).
- Tabela da prévia do Lattes com `caption`, `th scope` e rolagem horizontal própria (sem rolagem da página).
- Mensagens de salvar/erro em `FormAlert` (região de status); etapas da análise com `aria-live="polite"` sem anunciar cada token.
- Não pedimos diagnóstico para recursos de acessibilidade.

## Matriz de responsividade (emulação no Chromium)

| Largura × altura | Dispositivo representado | Páginas verificadas sem rolagem horizontal | Captura |
|---|---|---|---|
| 320 × 640 | celular pequeno | `/`, `/perfil`, `/participar`, `/participar/:id`, `/configuracoes`, `/testar` | — |
| 360 × 760 | Android comum (retrato) | idem | `04-participacao-360.png`, `09-perfil-360.png` |
| 390 × 844 | celular (retrato) | idem + início público | `08-inicio-publico-celular.png` |
| 768 × 1024 | tablet (retrato) | idem | — |
| 1024 × 768 | tablet (paisagem) | idem | — |
| 1440 × 900 | desktop | idem | `04-participacao-1440.png` |

E2E anteriores: `/testar` a 390 px e fluxo docente a 390 px (menu acessível).

## Pendências (não verificadas)

- Leitor de tela real (NVDA no Windows; TalkBack em Android físico).
- Aparelho Android físico: teclado virtual sobre campos, upload de PDF, download do PDF/JSON pelo navegador do celular.
- Zoom de 200%/400% e reflow manual em todas as páginas (o teste de 320 px cobre parte do reflow).
- VLibras: não está integrado. Se for adicionado, verificar que o botão não cobre controles e que é complemento, não substituto; planejar Libras revisada por profissional nos conteúdos prioritários e validação com pessoas surdas.
- Modo de leitura com menos distrações e alternativa HTML às exportações em PDF (planejado).

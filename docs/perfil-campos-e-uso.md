# Campos do perfil: finalidade e efeito (regra de recomendação v3)

| Campo | Finalidade | Onde entra | Efeito | Pode eliminar? |
|---|---|---|---|---|
| Áreas, temas, palavras-chave, competências | Aderência temática | `thematic` | Índice 0–100 = fração dos pesos do perfil encontrados no edital (referência 9–15 pontos; não satura com poucos termos) | Não |
| Tipos de oportunidade + **objetivos** (bolsas, pesquisa, extensão, inovação, hackathons, concursos, formação, eventos) | Interesse | `interest.opportunity_type`, `interest.preferences[objetivos]` | Corresponde / não corresponde, com o motivo | Não |
| Interesses do momento | Interesse | `interest.temporary_matches` | Mostra o termo encontrado | Não |
| **Modalidade** | Preferência | `interest.preferences[modalidade]` | Comparada só se o edital informar; senão "o edital não informa" | Não |
| **Cidade/UF** | Preferência | `interest.preferences[localizacao]` | Comparada só se o edital restringir região | Não (a exigência formal de instituição no DF fica na elegibilidade) |
| **Formação (situação)** | Preferência | `interest.preferences[formacao]` | Comparada só se o edital pedir matrícula ("cursando") | Não |
| Titulação, vínculo, instituição, Lattes | Elegibilidade | `eligibility.checks` (eligibility.ts) | Atendida / não atendida / pendente, com trecho e motivo; só requisito obrigatório e aplicável elimina | Sim, quando obrigatório |
| Papel (coordenar/colaborar) | Alcance do requisito | eligibility.ts | Exigência "do coordenador" não elimina quem colabora | — |
| Vínculos (estudante, docente…) | Orientação e contexto | Perfil; contexto de projetos | Não concedem permissão nenhuma | Não |
| Objetivo atual | Página inicial | `/inicio` | Ordena "O que você quer fazer?" | Não |

O índice **não é probabilidade de aprovação**. Recomendações calculadas com regra anterior (`rule_version` ≠ 3) são recalculadas na próxima consulta.

/**
 * Isola o navegador das jornadas: só a pilha local de teste responde. Qualquer outro endereço
 * (CDN do OCR, fontes, analytics…) é recusado, para o resultado não depender da rede do runner.
 * Sem isso, o OCR do navegador baixava o Tesseract de um CDN no CI e rodava de verdade, e a
 * mesma jornada passava aqui e falhava lá.
 */
const LOCAL = /^(https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/|data:|blob:|about:)/;
export const blockedHosts = new Set();
export async function isolate(ctx) {
  await ctx.route(
    (url) => !LOCAL.test(url.href),
    (route) => {
      blockedHosts.add(new URL(route.request().url()).host);
      return route.abort("blockedbyclient");
    },
  );
}

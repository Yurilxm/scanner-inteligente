// Acha o convite do Control num texto (QR lido, ou mensagem colada do WhatsApp com texto em volta).
// Só separa as partes; quem confere de verdade é parseInviteLink (src/sync/crypto.ts).

const INVITE = /scannerinteligente:\/\/convite\?[^\s]+/;

export type InviteParams = { i: string; s: string };

export function extractInvite(text: string): InviteParams | null {
  const match = INVITE.exec(text ?? '');
  if (!match) return null;
  const query = match[0].slice(match[0].indexOf('?') + 1);
  const params = new Map(query.split('&').map(pair => {
    const [k, v = ''] = pair.split('=');
    return [k, v] as const;
  }));
  const i = params.get('i');
  const s = params.get('s');
  if (!i || !s) return null;
  try {
    return { i: decodeURIComponent(i), s: decodeURIComponent(s) };
  } catch {
    return null;
  }
}

// Monta de volta o link (a rota /convite recebe i e s, tanto do QR quanto do deep link)
export function inviteLinkFromParams(params: InviteParams): string {
  return `scannerinteligente://convite?i=${encodeURIComponent(params.i)}&s=${params.s}`;
}

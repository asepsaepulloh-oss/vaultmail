import PostalMime from 'postal-mime';

export default {
  async email(message, env, ctx) {
    try {
        const parser = new PostalMime();
        const rawEmail = await new Response(message.raw).arrayBuffer();
        const email = await parser.parse(rawEmail);
        
        const toBase64 = (value) => {
          if (!value) return '';
          const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
          let binary = '';
          bytes.forEach((byte) => {
            binary += String.fromCharCode(byte);
          });
          return btoa(binary);
        };

        // --- KONFIGURASI UTAMA ---
        const targetUrl = "https://vaultmail-production.up.railway.app/api/webhook";
        const forwardDomains = ["zeth.web.id", "sepia.my.id", "louiv.me"];
        const forwardEmail = "j02944426@gmail.com";
        // -------------------------

        const parsedSenderAddress = email?.sender?.value?.[0]?.address;
        const parsedSenderName = email?.sender?.value?.[0]?.name;
        const parsedFromAddress = email?.from?.value?.[0]?.address;
        const parsedFromName = email?.from?.value?.[0]?.name;
        const parsedFromText = email?.from?.text || message.headers.get('from');
        const fallbackFromName = parsedFromAddress
          ? parsedFromAddress.split('@').pop()?.replace(/^mail\./, '')
          : undefined;
          
        const cleanName = (value) => value?.replace(/^"+|"+$/g, '').trim();
        const parsedFrom =
          parsedSenderName && parsedSenderAddress
            ? `${cleanName(parsedSenderName)} <${parsedSenderAddress}>`
            : parsedFromName && parsedFromAddress
              ? `${cleanName(parsedFromName)} <${parsedFromAddress}>`
              : cleanName(parsedSenderName) ||
                cleanName(parsedFromName) ||
                parsedFromText ||
                fallbackFromName ||
                parsedFromAddress ||
                parsedSenderAddress ||
                message.from;

        const recipients = Array.isArray(message.to) ? message.to : [message.to];
        const recipientTo = recipients.length === 1 ? recipients[0] : recipients;

        const shouldForward =
          Boolean(forwardEmail) &&
          forwardDomains.length > 0 &&
          recipients.some((recipient) => {
            const domain = recipient?.split('@').pop()?.toLowerCase();
            return domain && forwardDomains.includes(domain);
          });

        if (shouldForward) {
          await message.forward(forwardEmail);
        }

        if (!targetUrl) {
          console.warn('WEBHOOK_URL is not set; skipping webhook forwarding.');
          return;
        }

        const attachments = Array.isArray(email.attachments)
          ? email.attachments.map((attachment) => ({
              filename: attachment.filename,
              contentType: attachment.contentType,
              size: attachment.size,
              contentBase64: toBase64(attachment.content),
              contentId: attachment.contentId
            }))
          : [];

        const response = await fetch(targetUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: parsedFrom,
            to: recipientTo,
            subject: message.headers.get('subject'),
            text: email.text,
            html: email.html,
            attachments
          })
        });

        if (!response.ok) {
            console.error(`Failed to forward email: ${response.status} ${response.statusText}`);
            message.setReject("Failed to forward email");
        }
    } catch (e) {
        console.error("Worker Error:", e);
        message.setReject("Internal Worker Error");
    }
  }
};

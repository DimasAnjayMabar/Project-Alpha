import React, { useState, useRef, useEffect } from 'react';
import {
  MessageSquare,
  Send,
  X,
  BookOpen,
  Layers,
  MessageCircle,
  Loader2,
} from 'lucide-react';
import ProductArtwork from './ProductArtwork';
import { formatRupiah, buildProductOrderWaUrl } from '../utils/helpers';
import {
  QUICK_PROMPTS,
  INITIAL_CHAT_MESSAGES,
  getChatbotResponse,
} from '../utils/chatbotService';

function renderInlineMarkdown(text) {
  const tokens = String(text || '').split(
    /(\*\*\*[^*]+\*\*\*|\*\*[^*]+\*\*|\*[^*\n]+\*|`[^`]+`)/g
  );

  return tokens.map((token, idx) => {
    if (token.startsWith('***') && token.endsWith('***') && token.length > 6) {
      return (
        <strong key={idx} className="font-semibold italic">
          {token.slice(3, -3)}
        </strong>
      );
    }
    if (token.startsWith('**') && token.endsWith('**') && token.length > 4) {
      return (
        <strong key={idx} className="font-semibold text-[#1C1917]">
          {token.slice(2, -2)}
        </strong>
      );
    }
    if (token.startsWith('*') && token.endsWith('*') && token.length > 2) {
      return (
        <em key={idx} className="italic">
          {token.slice(1, -1)}
        </em>
      );
    }
    if (token.startsWith('`') && token.endsWith('`') && token.length > 2) {
      return (
        <code
          key={idx}
          className="px-1 py-0.5 rounded bg-[#EFEAE0] text-[12.5px] font-mono"
        >
          {token.slice(1, -1)}
        </code>
      );
    }
    return <React.Fragment key={idx}>{token}</React.Fragment>;
  });
}

function renderFormattedText(rawText) {
  const lines = String(rawText || '').replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const trimmed = lines[i].trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    // Heading (#, ##, ###)
    const headingMatch = trimmed.match(/^#{1,3}\s+(.+)$/);
    if (headingMatch) {
      blocks.push(
        <p key={`h-${i}`} className="font-semibold text-[#1C1917]">
          {renderInlineMarkdown(headingMatch[1])}
        </p>
      );
      i += 1;
      continue;
    }

    // Unordered list (- item, * item, atau • item)
    if (/^[-*•]\s+/.test(trimmed)) {
      const items = [];
      const startIdx = i;
      while (i < lines.length && /^[-*•]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*•]\s+/, ''));
        i += 1;
      }
      blocks.push(
        <ul key={`ul-${startIdx}`} className="list-disc pl-4 space-y-1.5">
          {items.map((item, idx) => (
            <li key={idx} className="leading-relaxed">
              {renderInlineMarkdown(item)}
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Ordered list (1. item)
    if (/^\d+\.\s+/.test(trimmed)) {
      const items = [];
      const startIdx = i;
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ''));
        i += 1;
      }
      blocks.push(
        <ol key={`ol-${startIdx}`} className="list-decimal pl-4 space-y-1.5">
          {items.map((item, idx) => (
            <li key={idx} className="leading-relaxed">
              {renderInlineMarkdown(item)}
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // Paragraf biasa
    const paraLines = [];
    const startIdx = i;
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^[-*•]\s+/.test(lines[i].trim()) &&
      !/^\d+\.\s+/.test(lines[i].trim()) &&
      !/^#{1,3}\s+/.test(lines[i].trim())
    ) {
      paraLines.push(lines[i].trim());
      i += 1;
    }
    blocks.push(
      <p key={`p-${startIdx}`} className="leading-relaxed">
        {renderInlineMarkdown(paraLines.join(' '))}
      </p>
    );
  }

  return <div className="space-y-2">{blocks}</div>;
}

export default function BatikChatbotWidget({
  enrichedProducts,
  shopBooks,
  getEffectiveWa,
  onOpenBookProduct,
  onTryIn3D,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState(INITIAL_CHAT_MESSAGES);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef(null);
  const abortControllerRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isTyping, isOpen]);

  // Batalkan polling bila komponen di-unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const handleSendMessage = async (rawText) => {
    const text = (rawText ?? inputText).trim();
    if (!text || isTyping) return;

    const userMsg = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text,
      products: [],
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    setIsTyping(true);

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const reply = await getChatbotResponse(
        text,
        { enrichedProducts, shopBooks },
        { signal: controller.signal }
      );
      setMessages((prev) => [
        ...prev,
        {
          id: `bot-${Date.now()}`,
          sender: 'bot',
          intent: reply.intent,
          text: reply.text,
          products: reply.products || [],
        },
      ]);
    } catch (err) {
      if (err?.name === 'AbortError') return;
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          sender: 'bot',
          text:
            err?.message ||
            'Terjadi gangguan saat menghubungi asisten batik. Silakan coba lagi.',
          products: [],
        },
      ]);
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
        setIsTyping(false);
      }
    }
  };

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end">
      {/* Jendela Obrolan */}
      {isOpen && (
        <div className="mb-3 w-[340px] sm:w-[390px] h-[510px] max-h-[78vh] rounded-lg bg-[#FAF8F3] border border-[#1C1917]/15 shadow-[0_18px_48px_rgba(28,25,23,0.22)] flex flex-col overflow-hidden fade-panel">
          {/* Header */}
          <div className="px-4 py-3.5 bg-[#1B1714] text-[#F5F1E8] flex items-center justify-between border-b border-white/12">
            <div>
              <span className="font-serif font-normal text-base block leading-tight">
                Asisten Wastra Trenggalek
              </span>
              <span className="text-[13px] text-[#B5ACA2] block mt-0.5">
                Bantu cari motif, harga, dan sanggar
              </span>
            </div>

            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="min-h-[38px] min-w-[38px] inline-flex items-center justify-center rounded-md bg-white/10 hover:bg-white/20 text-[#F5F1E8] cursor-pointer"
              aria-label="Tutup asisten"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Area Pesan */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map((msg) => {
              const isUser = msg.sender === 'user';
              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} space-y-2`}
                >
                  <div
                    className={`max-w-[88%] px-3.5 py-2.5 rounded-md text-[14px] leading-relaxed break-words ${
                      isUser
                        ? 'bg-[#7C3219] text-white whitespace-pre-line'
                        : 'bg-[#FCFBF8] text-[#1C1917] border border-[#1C1917]/12'
                    }`}
                  >
                    {isUser ? msg.text : renderFormattedText(msg.text)}
                  </div>

                  {/* Kartu Rekomendasi Produk di Dalam Chat */}
                  {!isUser && msg.products?.length > 0 && (
                    <div className="w-full space-y-2">
                      {msg.products.map((prod) => {
                        const effectiveWa = getEffectiveWa(
                          prod.shop?.id,
                          prod.shop?.number
                        );
                        const waUrl = effectiveWa
                          ? buildProductOrderWaUrl(
                              prod.shop,
                              effectiveWa,
                              prod,
                              'Asisten Chatbot Batik Wicara'
                            )
                          : '';
                        const canNavigateCatalog = !prod._isSynthetic && prod.shop?.id;

                        return (
                          <div
                            key={prod.id}
                            className="p-3 rounded-md bg-[#FCFBF8] border border-[#1C1917]/12 space-y-2.5"
                          >
                            <div className="flex items-center gap-3">
                              <ProductArtwork
                                product={prod}
                                imageUrl={prod.primaryImageUrl}
                                size={96}
                                className="w-14 h-12 rounded-sm shrink-0 border border-[#1C1917]/12"
                              />
                              <div className="min-w-0 flex-1">
                                <span className="text-[13px] font-medium text-[#7C3219] block truncate">
                                  {prod.shop?.name || 'Sanggar Batik'}
                                </span>
                                <span className="font-serif font-medium text-[15px] text-[#1C1917] block truncate">
                                  {prod.name}
                                </span>
                                <span className="text-[13px] font-semibold text-[#1C1917] tabular-nums">
                                  {formatRupiah(prod.price)}
                                </span>
                              </div>
                            </div>

                            <div className="grid grid-cols-3 gap-1.5">
                              <button
                                type="button"
                                disabled={!canNavigateCatalog}
                                onClick={() => {
                                  if (!canNavigateCatalog) return;
                                  onOpenBookProduct(prod.shop.id, prod.id);
                                  setIsOpen(false);
                                }}
                                className="min-h-[38px] px-2 rounded-[10px] bg-[#F7F4EE] hover:bg-[#EFEAE0] disabled:opacity-45 border border-[#1C1917]/15 text-[13px] font-medium text-[#1C1917] flex items-center justify-center gap-1 cursor-pointer disabled:cursor-not-allowed"
                              >
                                <BookOpen className="w-3.5 h-3.5 text-[#7C3219]" />
                                <span>Detail</span>
                              </button>
                              <button
                                type="button"
                                disabled={!canNavigateCatalog}
                                onClick={() => {
                                  if (!canNavigateCatalog) return;
                                  onTryIn3D(prod.id);
                                  setIsOpen(false);
                                }}
                                className="min-h-[38px] px-2 rounded-[10px] bg-[#F7F4EE] hover:bg-[#EFEAE0] disabled:opacity-45 border border-[#1C1917]/15 text-[13px] font-medium text-[#1C1917] flex items-center justify-center gap-1 cursor-pointer disabled:cursor-not-allowed"
                              >
                                <Layers className="w-3.5 h-3.5 text-[#7C3219]" />
                                <span>3D</span>
                              </button>
                              {waUrl ? (
                                <a
                                  href={waUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="min-h-[38px] px-2 rounded-[10px] bg-[#1D6B44] hover:bg-[#165233] text-white text-[13px] font-medium flex items-center justify-center gap-1 transition-colors"
                                >
                                  <MessageCircle className="w-3.5 h-3.5" />
                                  <span>WA</span>
                                </a>
                              ) : (
                                <span className="min-h-[38px] px-2 rounded-[10px] bg-[#EFEAE0] text-[#575049] text-[12px] font-medium flex items-center justify-center">
                                  No WA
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            {isTyping && (
              <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-md bg-[#FCFBF8] border border-[#1C1917]/12 text-[13px] text-[#575049] italic">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[#7C3219]" />
                <span>Asisten sedang menyiapkan jawaban...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Pilihan Pertanyaan Cepat */}
          <div className="px-3 py-2 bg-[#EFEAE0] border-t border-[#1C1917]/12 flex gap-1.5 overflow-x-auto">
            {QUICK_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                disabled={isTyping}
                onClick={() => handleSendMessage(prompt)}
                className="shrink-0 min-h-[36px] px-3 py-1 rounded-md bg-[#FCFBF8] hover:bg-white disabled:opacity-50 border border-[#1C1917]/15 text-[13px] font-medium text-[#1C1917] cursor-pointer disabled:cursor-not-allowed"
              >
                {prompt}
              </button>
            ))}
          </div>

          {/* Input Teks */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="p-2.5 bg-[#FCFBF8] border-t border-[#1C1917]/12 flex items-center gap-2"
          >
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              disabled={isTyping}
              placeholder="Tanya motif, harga, atau sanggar..."
              aria-label="Ketik pertanyaan untuk asisten katalog"
              className="flex-1 min-h-[44px] px-3 py-2 rounded-md bg-[#F7F4EE] border border-[#1C1917]/20 text-[14px] text-[#1C1917] disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={!inputText.trim() || isTyping}
              className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-md bg-[#7C3219] hover:bg-[#632612] disabled:opacity-40 text-white cursor-pointer disabled:cursor-not-allowed transition-colors"
              aria-label="Kirim pesan"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}

      {/* Tombol Melayang */}
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="inline-flex items-center gap-2.5 min-h-[44px] px-4 py-2.5 rounded-[10px] bg-[#1B1714] hover:bg-[#2A2420] text-[#F5F1E8] border border-white/15 shadow-[0_8px_24px_rgba(28,25,23,0.2)] text-[14px] font-medium transition-colors cursor-pointer"
      >
        <MessageSquare className="w-4 h-4 text-[#C4A46B]" />
        <span>{isOpen ? 'Tutup Asisten' : 'Tanya Asisten Batik'}</span>
      </button>
    </div>
  );
}
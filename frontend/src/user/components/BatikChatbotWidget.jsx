import React, { useState, useRef, useEffect } from 'react';
import {
  MessageSquare,
  Send,
  X,
  BookOpen,
  Layers,
  MessageCircle,
} from 'lucide-react';
import ProductArtwork from './ProductArtwork';
import { formatRupiah, buildProductOrderWaUrl } from '../utils/helpers';
import {
  QUICK_PROMPTS,
  INITIAL_CHAT_MESSAGES,
  getChatbotResponse,
} from '../utils/chatbotService';

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

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isTyping, isOpen]);

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

    try {
      const reply = await getChatbotResponse(text, { enrichedProducts, shopBooks });
      setMessages((prev) => [
        ...prev,
        {
          id: `bot-${Date.now()}`,
          sender: 'bot',
          text: reply.text,
          products: reply.products || [],
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          sender: 'bot',
          text: 'Terjadi gangguan saat memproses pertanyaan. Silakan coba lagi.',
          products: [],
        },
      ]);
    } finally {
      setIsTyping(false);
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
                    className={`max-w-[86%] px-3.5 py-2.5 rounded-md text-[14px] leading-relaxed whitespace-pre-line ${
                      isUser
                        ? 'bg-[#7C3219] text-white'
                        : 'bg-[#FCFBF8] text-[#1C1917] border border-[#1C1917]/12'
                    }`}
                  >
                    {msg.text}
                  </div>

                  {/* Kartu Rekomendasi Produk di Dalam Chat */}
                  {!isUser && msg.products?.length > 0 && (
                    <div className="w-full space-y-2">
                      {msg.products.map((prod) => {
                        const waUrl = buildProductOrderWaUrl(
                          prod.shop,
                          getEffectiveWa(prod.shop.id, prod.shop.number),
                          prod,
                          'Asisten Chatbot Batik Wicara'
                        );

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
                                  {prod.shop.name}
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
                                onClick={() => {
                                  onOpenBookProduct(prod.shop.id, prod.id);
                                  setIsOpen(false);
                                }}
                                className="min-h-[38px] px-2 rounded-[10px] bg-[#F7F4EE] hover:bg-[#EFEAE0] border border-[#1C1917]/15 text-[13px] font-medium text-[#1C1917] flex items-center justify-center gap-1 cursor-pointer"
                              >
                                <BookOpen className="w-3.5 h-3.5 text-[#7C3219]" />
                                <span>Buku</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  onTryIn3D(prod.id);
                                  setIsOpen(false);
                                }}
                                className="min-h-[38px] px-2 rounded-[10px] bg-[#F7F4EE] hover:bg-[#EFEAE0] border border-[#1C1917]/15 text-[13px] font-medium text-[#1C1917] flex items-center justify-center gap-1 cursor-pointer"
                              >
                                <Layers className="w-3.5 h-3.5 text-[#7C3219]" />
                                <span>3D</span>
                              </button>
                              <a
                                href={waUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="min-h-[38px] px-2 rounded-[10px] bg-[#1D6B44] hover:bg-[#165233] text-white text-[13px] font-medium flex items-center justify-center gap-1 transition-colors"
                              >
                                <MessageCircle className="w-3.5 h-3.5" />
                                <span>WA</span>
                              </a>
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
              <div className="inline-block px-3.5 py-2 rounded-md bg-[#FCFBF8] border border-[#1C1917]/12 text-[13px] text-[#575049] italic">
                Asisten sedang mengetik...
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
                onClick={() => handleSendMessage(prompt)}
                className="shrink-0 min-h-[36px] px-3 py-1 rounded-md bg-[#FCFBF8] hover:bg-white border border-[#1C1917]/15 text-[13px] font-medium text-[#1C1917] cursor-pointer"
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
              placeholder="Tanya motif, harga, atau sanggar..."
              aria-label="Ketik pertanyaan untuk asisten katalog"
              className="flex-1 min-h-[44px] px-3 py-2 rounded-md bg-[#F7F4EE] border border-[#1C1917]/20 text-[14px] text-[#1C1917]"
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

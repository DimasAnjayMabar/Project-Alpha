import React, { useState, useRef, useEffect } from 'react';
import {
  Bot,
  Send,
  X,
  BookOpen,
  Layers,
  MessageCircle,
  Sparkles,
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
        <div className="mb-3 w-[340px] sm:w-[390px] h-[500px] max-h-[78vh] rounded-3xl bg-[#FCF9F2] border border-[#DFD2BC] shadow-[0_20px_50px_rgba(32,19,12,0.28)] flex flex-col overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3.5 bg-gradient-to-r from-[#2C241E] to-[#4A2516] text-white flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-amber-400 text-[#2C241E] flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4" />
              </div>
              <div>
                <span className="font-serif font-bold text-sm block leading-tight">
                  Asisten Wastra Trenggalek
                </span>
                <span className="text-[10px] text-amber-300 flex items-center gap-1">
                  <Sparkles className="w-2.5 h-2.5" />
                  <span>Siap bantu cari motif &amp; sanggar</span>
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white cursor-pointer"
              aria-label="Tutup Chatbot"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Area Pesan */}
          <div className="flex-1 overflow-y-auto p-3.5 space-y-3">
            {messages.map((msg) => {
              const isUser = msg.sender === 'user';
              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} space-y-2`}
                >
                  <div
                    className={`max-w-[86%] px-3.5 py-2.5 rounded-2xl text-xs leading-relaxed whitespace-pre-line ${
                      isUser
                        ? 'bg-[#8B3A1E] text-white rounded-br-sm'
                        : 'bg-white text-[#2C241E] border border-[#E6DDD0] rounded-bl-sm shadow-2xs'
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
                            className="p-2.5 rounded-2xl bg-white border border-[#DFD2BC] space-y-2 shadow-2xs"
                          >
                            <div className="flex items-center gap-2.5">
                              <ProductArtwork
                                product={prod}
                                imageUrl={prod.primaryImageUrl}
                                size={96}
                                className="w-12 h-12 rounded-xl shrink-0 border border-[#E6DDD0]"
                              />
                              <div className="min-w-0 flex-1">
                                <span className="text-[10px] font-bold text-[#8B3A1E] block truncate">
                                  {prod.shop.name}
                                </span>
                                <span className="font-serif font-bold text-xs text-[#2C241E] block truncate">
                                  {prod.name}
                                </span>
                                <span className="text-[11px] font-bold text-emerald-700">
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
                                className="py-1.5 px-2 rounded-lg bg-[#FAF7F2] hover:bg-amber-50 border border-[#E6DDD0] text-[10px] font-bold text-[#2C241E] flex items-center justify-center gap-1 cursor-pointer"
                              >
                                <BookOpen className="w-3 h-3 text-[#8B3A1E]" />
                                <span>Buku</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  onTryIn3D(prod.id);
                                  setIsOpen(false);
                                }}
                                className="py-1.5 px-2 rounded-lg bg-[#FAF7F2] hover:bg-amber-50 border border-[#E6DDD0] text-[10px] font-bold text-[#2C241E] flex items-center justify-center gap-1 cursor-pointer"
                              >
                                <Layers className="w-3 h-3 text-[#8B3A1E]" />
                                <span>3D</span>
                              </button>
                              <a
                                href={waUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="py-1.5 px-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold flex items-center justify-center gap-1"
                              >
                                <MessageCircle className="w-3 h-3" />
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
              <div className="inline-block px-3.5 py-2 rounded-2xl bg-white border border-[#E6DDD0] text-[11px] text-[#6B5B4E] italic">
                Asisten sedang mengetik...
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Pilihan Pertanyaan Cepat */}
          <div className="px-3 py-2 bg-[#F4ECE0] border-t border-[#E6DDD0] flex gap-1.5 overflow-x-auto">
            {QUICK_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => handleSendMessage(prompt)}
                className="shrink-0 px-2.5 py-1 rounded-full bg-white hover:bg-amber-50 border border-[#DFD2BC] text-[10px] font-bold text-[#2C241E] cursor-pointer"
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
            className="p-2.5 bg-white border-t border-[#E6DDD0] flex items-center gap-2"
          >
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Tanya motif, harga, atau sanggar..."
              className="flex-1 px-3 py-2 rounded-xl bg-[#FAF7F2] border border-[#E6DDD0] text-xs text-[#2C241E] focus:outline-none focus:border-[#8B3A1E]"
            />
            <button
              type="submit"
              disabled={!inputText.trim() || isTyping}
              className="p-2.5 rounded-xl bg-[#8B3A1E] hover:bg-[#A34424] disabled:opacity-40 text-white cursor-pointer disabled:cursor-not-allowed"
              aria-label="Kirim Pesan"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      )}

      {/* Tombol Melayang (Floating Button) */}
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="inline-flex items-center gap-2.5 px-4 py-3 rounded-full bg-[#2C241E] hover:bg-[#3F342B] text-amber-300 border border-amber-400/40 shadow-[0_12px_30px_rgba(32,19,12,0.35)] text-xs font-bold transition-transform hover:scale-105 cursor-pointer"
      >
        <Bot className="w-4 h-4" />
        <span>{isOpen ? 'Tutup Asisten' : 'Tanya Asisten Batik'}</span>
      </button>
    </div>
  );
}
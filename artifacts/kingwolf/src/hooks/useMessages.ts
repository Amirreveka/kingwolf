import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Message } from '../types';
import { useAuth } from '../contexts/AuthContext';

const API_BASE = (import.meta.env.VITE_API_BASE as string) || '/api';
async function apiCall(path: string, opts: RequestInit = {}) {
  const token = localStorage.getItem('kingwolf_token');
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(opts.headers as any) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers });
  try { return await res.json(); } catch { return {}; }
}

export function useMessages(conversationId: string | null) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchMessages = useCallback(async () => {
    if (!conversationId) { setMessages([]); return; }
    setLoading(true);
    const { data } = await supabase
      .from('messages')
      .select('*, sender:profiles!sender_id(*)')
      .eq('conversation_id', conversationId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: true })
      .limit(200);
    if (data) setMessages(data as Message[]);
    setLoading(false);
  }, [conversationId]);

  useEffect(() => {
    fetchMessages();
    if (!conversationId) return;

    const channel = supabase
      .channel(`messages-${conversationId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'messages',
        filter: `conversation_id=eq.${conversationId}`,
      }, async (payload) => {
        const { data: msgWithSender } = await supabase
          .from('messages')
          .select('*, sender:profiles!sender_id(*)')
          .eq('id', payload.new.id)
          .single();
        if (msgWithSender) setMessages((prev) => {
          if (prev.find(m => m.id === (msgWithSender as Message).id)) return prev;
          return [...prev, msgWithSender as Message];
        });
      })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'messages',
        filter: `conversation_id=eq.${conversationId}`,
      }, (payload) => {
        if (payload.new.is_deleted) {
          setMessages(prev => prev.filter(m => m.id !== payload.new.id));
        } else {
          setMessages(prev => prev.map(m => m.id === payload.new.id ? { ...m, ...payload.new } : m));
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [conversationId, fetchMessages]);

  async function sendMessage(
    content: string,
    options?: { type?: string; mediaUrl?: string; replyToId?: string | null; forwardFromId?: string | null }
  ): Promise<boolean> {
    if (!user || !conversationId || !content.trim()) return false;
    const { error } = await supabase.from('messages').insert({
      conversation_id: conversationId,
      sender_id: user.id,
      content: content.trim(),
      type: options?.type || 'text',
      media_url: options?.mediaUrl || '',
      reply_to_id: options?.replyToId || null,
      forwarded_from_id: options?.forwardFromId || null,
    });
    if (!error) {
      await supabase.from('conversations').update({
        last_message_at: new Date().toISOString(),
        last_message_preview: content.trim().slice(0, 100),
      }).eq('id', conversationId);
    }
    return !error;
  }

  async function editMessage(messageId: string, newContent: string): Promise<void> {
    if (!newContent.trim()) return;
    await apiCall(`/messages/${messageId}`, {
      method: 'PUT',
      body: JSON.stringify({ content: newContent.trim() }),
    });
    setMessages(prev => prev.map(m =>
      m.id === messageId ? { ...m, content: newContent.trim(), is_edited: true } : m
    ));
  }

  async function deleteMessage(messageId: string): Promise<void> {
    await supabase.from('messages').update({ is_deleted: true }).eq('id', messageId);
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
  }

  return { messages, loading, sendMessage, editMessage, deleteMessage, refresh: fetchMessages };
}

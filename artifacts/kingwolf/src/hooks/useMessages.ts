import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Message } from '../types';
import { useAuth } from '../contexts/AuthContext';

const API_BASE = (import.meta.env.VITE_API_BASE as string) || '/api';
async function apiCall(path: string, opts: RequestInit = {}) {
  const token = localStorage.getItem('kingwolf_token');
  const headers: Record<string, string> = { ...(opts.headers as any) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (!(opts.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers });
  try { return await res.json(); } catch { return {}; }
}

export function useMessages(conversationId: string | null) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [readMessageIds, setReadMessageIds] = useState<Set<string>>(new Set());

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

  const markAsRead = useCallback(async () => {
    if (!conversationId || !user) return;
    try {
      const result = await apiCall(`/messages/read`, {
        method: 'POST',
        body: JSON.stringify({ conversation_id: conversationId }),
      });
      if (result.read_ids) {
        setReadMessageIds(prev => {
          const next = new Set(prev);
          (result.read_ids as string[]).forEach(id => next.add(id));
          return next;
        });
      }
    } catch {}
  }, [conversationId, user]);

  useEffect(() => {
    fetchMessages();
    if (!conversationId) return;

    // Mark as read when conversation opens
    markAsRead();

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
        if (msgWithSender) {
          setMessages((prev) => {
            // Don't add if already exists (optimistic update already added it)
            if (prev.find(m => m.id === (msgWithSender as Message).id)) return prev;
            return [...prev, msgWithSender as Message];
          });
          // Mark new incoming message as read automatically
          markAsRead();
        }
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
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'message_read_receipts',
      }, (payload) => {
        if (payload.new.message_id) {
          setReadMessageIds(prev => {
            const next = new Set(prev);
            next.add(payload.new.message_id);
            return next;
          });
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [conversationId, fetchMessages, markAsRead]);

  async function sendMessage(
    content: string,
    options?: { type?: string; mediaUrl?: string; replyToId?: string | null; forwardFromId?: string | null }
  ): Promise<boolean> {
    if (!user || !conversationId || !content.trim()) return false;

    // Optimistic: add message immediately to state
    const tempId = `temp-${Date.now()}`;
    const tempMsg: Message = {
      id: tempId,
      conversation_id: conversationId,
      sender_id: user.id,
      content: content.trim(),
      type: options?.type || 'text',
      media_url: options?.mediaUrl || '',
      reply_to_id: options?.replyToId || null,
      forwarded_from_id: options?.forwardFromId || null,
      is_deleted: false,
      is_edited: false,
      created_at: new Date().toISOString(),
      sender: null as any,
    };
    setMessages(prev => [...prev, tempMsg]);

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
      // Remove temp message - real one will arrive via WS
      setMessages(prev => prev.filter(m => m.id !== tempId));
    } else {
      // Remove temp on error
      setMessages(prev => prev.filter(m => m.id !== tempId));
    }
    return !error;
  }

  async function sendMediaMessage(file: File, options?: { replyToId?: string | null }): Promise<boolean> {
    if (!user || !conversationId) return false;
    const form = new FormData();
    form.append('file', file);
    form.append('conversation_id', conversationId);
    if (options?.replyToId) form.append('reply_to_id', options.replyToId);
    const result = await apiCall('/messages/upload', { method: 'POST', body: form });
    if (result.ok) {
      await supabase.from('conversations').update({
        last_message_at: new Date().toISOString(),
        last_message_preview: result.content || `📎 ${file.name}`,
      }).eq('id', conversationId);
      return true;
    }
    return false;
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

  return { messages, loading, sendMessage, sendMediaMessage, editMessage, deleteMessage, refresh: fetchMessages, readMessageIds, markAsRead };
}

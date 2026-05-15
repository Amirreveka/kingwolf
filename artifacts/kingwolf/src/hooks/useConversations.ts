import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Conversation, Profile } from '../types';
import { useAuth } from '../contexts/AuthContext';

const API_BASE = (import.meta.env.VITE_API_BASE as string) || '/api';

export function useConversations() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const fetchingRef = useRef(false);
  const activeConvRef = useRef<string | null>(null);

  // Called by MessengerLayout when a conversation is selected
  function setActiveConversation(id: string | null) {
    activeConvRef.current = id;
    if (id) {
      // Clear unread for this conversation immediately
      setConversations(prev => prev.map(c => c.id === id ? { ...c, unread_count: 0 } as any : c));
    }
  }

  const fetchUnreadCounts = useCallback(async () => {
    if (!user) return;
    try {
      const token = localStorage.getItem('kingwolf_token');
      const res = await fetch(`${API_BASE}/unread-counts`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const body = await res.json();
      const counts: Record<string, number> = body.data || {};
      setConversations(prev => prev.map(c => ({ ...c, unread_count: counts[c.id] || 0 } as any)));
    } catch {}
  }, [user]);

  const fetchConversations = useCallback(async () => {
    if (!user || fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      const { data: memberRows } = await supabase
        .from('conversation_members')
        .select('conversation_id')
        .eq('user_id', user.id);

      if (!memberRows || memberRows.length === 0) {
        setConversations([]);
        setLoading(false);
        fetchingRef.current = false;
        return;
      }

      const ids = memberRows.map((r: { conversation_id: string }) => r.conversation_id);
      const { data: convos } = await supabase
        .from('conversations')
        .select('*')
        .in('id', ids)
        .order('last_message_at', { ascending: false });

      if (!convos) { setLoading(false); fetchingRef.current = false; return; }

      type ConvRow = { id: string; type: string; [key: string]: unknown };
      type MemberRow = { conversation_id: string; user_id: string };
      const directConvIds = (convos as ConvRow[]).filter((c: ConvRow) => c.type === 'direct').map((c: ConvRow) => c.id as string);
      const otherUserMap: Record<string, Profile> = {};

      if (directConvIds.length > 0) {
        const { data: dirMembers } = await supabase
          .from('conversation_members')
          .select('conversation_id, user_id')
          .in('conversation_id', directConvIds)
          .neq('user_id', user.id);

        if (dirMembers && dirMembers.length > 0) {
          const typedMembers = dirMembers as MemberRow[];
          const otherIds = [...new Set(typedMembers.map((r: MemberRow) => r.user_id))];
          const { data: profiles } = await supabase
            .from('profiles')
            .select('*')
            .in('id', otherIds);

          const profileMap = Object.fromEntries((profiles || []).map((p: Profile) => [p.id, p]));
          for (const row of typedMembers) {
            if (!otherUserMap[row.conversation_id]) {
              otherUserMap[row.conversation_id] = profileMap[row.user_id] as Profile;
            }
          }
        }
      }

      const enriched: Conversation[] = (convos as ConvRow[]).map((c: ConvRow) => {
        if (c.type === 'direct') return { ...c, other_user: otherUserMap[c.id as string] } as unknown as Conversation;
        return c as unknown as Conversation;
      });

      setConversations(enriched);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
    fetchingRef.current = false;
  }, [user]);

  useEffect(() => {
    fetchConversations().then(() => fetchUnreadCounts());
    if (!user) return;

    // Listen for conversation table changes (last_message_at updates → reorder)
    const convChannel = supabase
      .channel('conversations-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, () => {
        setTimeout(() => fetchConversations().then(() => fetchUnreadCounts()), 100);
      })
      .subscribe();

    // Listen for new messages to update unread counts + conversation order
    const msgChannel = supabase
      .channel('conversations-new-messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const msg = payload.new as any;
        if (!msg || !msg.conversation_id || msg.sender_id === user.id) return;
        // If this message is NOT in the active conversation, increment unread
        if (msg.conversation_id !== activeConvRef.current) {
          setConversations(prev => {
            const idx = prev.findIndex(c => c.id === msg.conversation_id);
            if (idx < 0) return prev;
            const updated = [...prev];
            const conv = { ...updated[idx], unread_count: ((updated[idx] as any).unread_count || 0) + 1 } as any;
            // Move to top
            updated.splice(idx, 1);
            updated.unshift(conv);
            return updated;
          });
        } else {
          // Active conversation — just move to top if needed
          setConversations(prev => {
            const idx = prev.findIndex(c => c.id === msg.conversation_id);
            if (idx <= 0) return prev;
            const updated = [...prev];
            const conv = updated.splice(idx, 1)[0];
            updated.unshift(conv);
            return updated;
          });
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(convChannel);
      supabase.removeChannel(msgChannel);
    };
  }, [user, fetchConversations, fetchUnreadCounts]);

  async function createDirectConversation(targetUserId: string): Promise<string | null> {
    if (!user) return null;
    try {
      const { data: myRows } = await supabase
        .from('conversation_members')
        .select('conversation_id')
        .eq('user_id', user.id);

      if (myRows && myRows.length > 0) {
        const myIds = (myRows as { conversation_id: string }[]).map((r) => r.conversation_id);
        const { data: targetRows } = await supabase
          .from('conversation_members')
          .select('conversation_id')
          .eq('user_id', targetUserId)
          .in('conversation_id', myIds);

        if (targetRows && targetRows.length > 0) {
          for (const row of targetRows) {
            const { data: conv } = await supabase
              .from('conversations')
              .select('id, type')
              .eq('id', row.conversation_id)
              .eq('type', 'direct')
              .maybeSingle();
            if (conv) { await fetchConversations(); return conv.id; }
          }
        }
      }

      const { data: conv, error: createErr } = await supabase
        .from('conversations')
        .insert({ type: 'direct', created_by: user.id, name: '' })
        .select('id')
        .single();

      if (createErr || !conv) return null;
      await supabase.from('conversation_members').insert([
        { conversation_id: conv.id, user_id: user.id, role: 'member' },
        { conversation_id: conv.id, user_id: targetUserId, role: 'member' },
      ]);
      await fetchConversations();
      return conv.id;
    } catch (e) {
      console.error('createDirectConversation failed:', e);
      return null;
    }
  }

  async function createGroup(name: string, description: string, memberIds: string[]): Promise<string | null> {
    if (!user) return null;
    const { data: conv, error } = await supabase
      .from('conversations')
      .insert({ type: 'group', name, description, created_by: user.id })
      .select('id')
      .single();
    if (error || !conv) return null;
    const members = [user.id, ...memberIds].map((uid) => ({
      conversation_id: conv.id, user_id: uid, role: uid === user.id ? 'owner' : 'member',
    }));
    await supabase.from('conversation_members').insert(members);
    await fetchConversations();
    return conv.id;
  }

  async function createChannel(name: string, description: string): Promise<string | null> {
    if (!user) return null;
    const { data: conv, error } = await supabase
      .from('conversations')
      .insert({ type: 'channel', name, description, created_by: user.id })
      .select('id')
      .single();
    if (error || !conv) return null;
    await supabase.from('conversation_members').insert({
      conversation_id: conv.id, user_id: user.id, role: 'owner',
    });
    await fetchConversations();
    return conv.id;
  }

  async function getSavedMessagesConversation(): Promise<string | null> {
    if (!user) return null;
    const { data: existing } = await supabase
      .from('conversations')
      .select('id')
      .eq('type', 'direct')
      .eq('created_by', user.id)
      .eq('name', '__saved__')
      .maybeSingle();
    if (existing) return existing.id;
    const { data: conv, error } = await supabase
      .from('conversations')
      .insert({ type: 'direct', name: '__saved__', created_by: user.id })
      .select('id')
      .single();
    if (error || !conv) return null;
    await supabase.from('conversation_members').insert({
      conversation_id: conv.id, user_id: user.id, role: 'member',
    });
    return conv.id;
  }

  return { conversations, loading, refresh: fetchConversations, createDirectConversation, createGroup, createChannel, getSavedMessagesConversation, setActiveConversation };
}

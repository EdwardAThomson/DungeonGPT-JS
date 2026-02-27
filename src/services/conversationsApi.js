import { apiFetch, getErrorMessage } from './apiClient';
import { supabase } from './supabaseClient';

// Use Supabase only in production (CloudFlare Pages)
// In dev, always use Express/SQLite even if Supabase is configured
const isProduction = process.env.REACT_APP_CF_PAGES === 'true';
const useSupabase = isProduction && !!supabase;

if (useSupabase) {
  console.log('[conversationsApi] Using Supabase backend (production)');
} else {
  console.log('[conversationsApi] Using Express/SQLite backend (dev)');
}

// Supabase implementation
const supabaseConversationsApi = {
  async list() {
    if (!supabase) {
      throw new Error('Supabase not configured');
    }
    
    const { data, error } = await supabase
      .from('conversations')
      .select('*')
      .order('updated_at', { ascending: false });
    
    if (error) throw new Error(`Failed to fetch conversations: ${error.message}`);
    return data || [];
  },

  async getById(sessionId) {
    if (!supabase) {
      throw new Error('Supabase not configured');
    }
    
    const { data, error } = await supabase
      .from('conversations')
      .select('*')
      .eq('session_id', sessionId)
      .single();
    
    if (error) throw new Error(`Failed to load conversation: ${error.message}`);
    return data;
  },

  async save(payload) {
    if (!supabase) {
      throw new Error('Supabase not configured');
    }
    
    const { data, error } = await supabase
      .from('conversations')
      .insert([{
        session_id: payload.sessionId,
        conversation_name: payload.conversationName,
        conversation_data: payload.conversationData,
        settings_snapshot: payload.settingsSnapshot
      }])
      .select()
      .single();
    
    if (error) throw new Error(`Failed to save conversation: ${error.message}`);
    return data;
  },

  async updateMessages(sessionId, conversationData) {
    if (!supabase) {
      throw new Error('Supabase not configured');
    }
    
    const { data, error } = await supabase
      .from('conversations')
      .update({ 
        conversation_data: conversationData,
        updated_at: new Date().toISOString()
      })
      .eq('session_id', sessionId)
      .select()
      .single();
    
    if (error) throw new Error(`Failed to update conversation: ${error.message}`);
    return data;
  },

  async updateName(sessionId, conversationName) {
    if (!supabase) {
      throw new Error('Supabase not configured');
    }
    
    const { data, error } = await supabase
      .from('conversations')
      .update({ 
        conversation_name: conversationName,
        updated_at: new Date().toISOString()
      })
      .eq('session_id', sessionId)
      .select()
      .single();
    
    if (error) throw new Error(`Failed to update conversation name: ${error.message}`);
    return data;
  },

  async remove(sessionId) {
    if (!supabase) {
      throw new Error('Supabase not configured');
    }
    
    const { error } = await supabase
      .from('conversations')
      .delete()
      .eq('session_id', sessionId);
    
    if (error) throw new Error(`Failed to delete conversation: ${error.message}`);
    return { success: true };
  }
};

// Express implementation (original)
const expressConversationsApi = {
  async list() {
    const response = await apiFetch('/api/conversations');
    if (!response.ok) {
      throw new Error(await getErrorMessage(response, 'Failed to fetch conversations'));
    }
    return response.json();
  },

  async getById(sessionId) {
    const response = await apiFetch(`/api/conversations/${sessionId}`);
    if (!response.ok) {
      throw new Error(await getErrorMessage(response, 'Failed to load conversation'));
    }
    return response.json();
  },

  async save(payload) {
    const response = await apiFetch('/api/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(await getErrorMessage(response, 'Failed to save conversation'));
    }
    return response.json();
  },

  async updateMessages(sessionId, conversationData) {
    const response = await apiFetch(`/api/conversations/${sessionId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversation_data: conversationData }),
    });

    if (!response.ok) {
      throw new Error(await getErrorMessage(response, 'Failed to update conversation'));
    }
    return response.json();
  },

  async updateName(sessionId, conversationName) {
    const response = await apiFetch(`/api/conversations/${sessionId}/name`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationName }),
    });

    if (!response.ok) {
      throw new Error(await getErrorMessage(response, 'Failed to update conversation name'));
    }
    return response.json();
  },

  async remove(sessionId) {
    const response = await apiFetch(`/api/conversations/${sessionId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      throw new Error(await getErrorMessage(response, 'Failed to delete conversation'));
    }
    return response.json();
  }
};

// Hybrid API that uses Supabase if configured, otherwise Express
export const conversationsApi = {
  async list() {
    return useSupabase ? supabaseConversationsApi.list() : expressConversationsApi.list();
  },

  async getById(sessionId) {
    return useSupabase ? supabaseConversationsApi.getById(sessionId) : expressConversationsApi.getById(sessionId);
  },

  async save(payload) {
    return useSupabase ? supabaseConversationsApi.save(payload) : expressConversationsApi.save(payload);
  },

  async updateMessages(sessionId, conversationData) {
    return useSupabase ? supabaseConversationsApi.updateMessages(sessionId, conversationData) : expressConversationsApi.updateMessages(sessionId, conversationData);
  },

  async updateName(sessionId, conversationName) {
    return useSupabase ? supabaseConversationsApi.updateName(sessionId, conversationName) : expressConversationsApi.updateName(sessionId, conversationName);
  },

  async remove(sessionId) {
    return useSupabase ? supabaseConversationsApi.remove(sessionId) : expressConversationsApi.remove(sessionId);
  }
};


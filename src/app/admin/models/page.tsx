'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Plus, Trash2, Edit3, Check, X, Server, Image, Video,
  ChevronDown, Loader2
} from 'lucide-react';

interface AIModel {
  id: string;
  name: string;
  endpoint_id: string;
  category: string;
  is_active: boolean;
  sort_order: number;
  description: string;
  created_at: string;
  updated_at: string;
}

export default function AdminModelsPage() {
  const [models, setModels] = useState<AIModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: '', endpoint_id: '', category: 'video', description: '' });
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({ name: '', endpoint_id: '', category: 'video', description: '' });
  const [saving, setSaving] = useState(false);

  const fetchModels = async () => {
    try {
      const res = await fetch('/api/models?admin=true');
      const data = await res.json();
      setModels(data.models || []);
    } catch (e) {
      console.error('Failed to fetch models:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchModels(); }, []);

  const filteredModels = categoryFilter === 'all'
    ? models
    : models.filter(m => m.category === categoryFilter);

  const handleAdd = async () => {
    if (!addForm.name.trim() || !addForm.endpoint_id.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addForm),
      });
      if (res.ok) {
        setAddForm({ name: '', endpoint_id: '', category: 'video', description: '' });
        setShowAddForm(false);
        fetchModels();
      } else {
        const data = await res.json();
        alert(data.error || '添加失败');
      }
    } catch { alert('网络错误'); }
    finally { setSaving(false); }
  };

  const handleUpdate = async (id: string) => {
    setSaving(true);
    try {
      const res = await fetch('/api/models', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...editForm }),
      });
      if (res.ok) {
        setEditingId(null);
        fetchModels();
      } else {
        const data = await res.json();
        alert(data.error || '更新失败');
      }
    } catch { alert('网络错误'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确认删除此模型？')) return;
    try {
      const res = await fetch(`/api/models?id=${id}`, { method: 'DELETE' });
      if (res.ok) fetchModels();
      else alert('删除失败');
    } catch { alert('网络错误'); }
  };

  const handleToggleActive = async (model: AIModel) => {
    try {
      const res = await fetch('/api/models', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: model.id, is_active: !model.is_active }),
      });
      if (res.ok) fetchModels();
    } catch { /* ignore */ }
  };

  const startEdit = (model: AIModel) => {
    setEditingId(model.id);
    setEditForm({
      name: model.name,
      endpoint_id: model.endpoint_id,
      category: model.category,
      description: model.description || '',
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Server className="w-6 h-6 text-cyan-500" />
              模型管理
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              管理AI生图/生视频可用模型，新增后自动同步至前端下拉选择框
            </p>
          </div>
          <Button
            onClick={() => setShowAddForm(!showAddForm)}
            className="bg-gradient-to-r from-cyan-500 to-blue-600 text-white"
          >
            <Plus className="w-4 h-4 mr-1" />
            新增模型
          </Button>
        </div>

        {/* Category Filter */}
        <div className="flex gap-2 mb-6">
          {[
            { key: 'all', label: '全部' },
            { key: 'video', label: '视频模型' },
            { key: 'image', label: '图片模型' },
          ].map(f => (
            <button
              key={f.key}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                categoryFilter === f.key
                  ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                  : 'bg-muted/50 text-muted-foreground hover:bg-muted'
              }`}
              onClick={() => setCategoryFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Add Form */}
        {showAddForm && (
          <Card className="border-cyan-500/30 mb-6 bg-cyan-500/5">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-cyan-400">新增模型</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">模型名称 *</label>
                  <Input
                    placeholder="如: Seedance 1.0 Pro"
                    value={addForm.name}
                    onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">模型Endpoint ID *</label>
                  <Input
                    placeholder="如: ark-45c3d43e-..."
                    value={addForm.endpoint_id}
                    onChange={e => setAddForm(f => ({ ...f, endpoint_id: e.target.value }))}
                    className="font-mono text-sm"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">类型</label>
                  <div className="flex gap-2">
                    <button
                      className={`px-3 py-1.5 rounded-lg text-sm ${addForm.category === 'video' ? 'bg-cyan-500/20 text-cyan-400' : 'bg-muted/50'}`}
                      onClick={() => setAddForm(f => ({ ...f, category: 'video' }))}
                    >
                      <Video className="w-3 h-3 inline mr-1" />视频
                    </button>
                    <button
                      className={`px-3 py-1.5 rounded-lg text-sm ${addForm.category === 'image' ? 'bg-violet-500/20 text-violet-400' : 'bg-muted/50'}`}
                      onClick={() => setAddForm(f => ({ ...f, category: 'image' }))}
                    >
                      <Image className="w-3 h-3 inline mr-1" />图片
                    </button>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">描述</label>
                  <Input
                    placeholder="可选"
                    value={addForm.description}
                    onChange={e => setAddForm(f => ({ ...f, description: e.target.value }))}
                  />
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <Button onClick={handleAdd} disabled={!addForm.name.trim() || !addForm.endpoint_id.trim() || saving} size="sm">
                  {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Check className="w-4 h-4 mr-1" />}
                  确认添加
                </Button>
                <Button onClick={() => setShowAddForm(false)} variant="outline" size="sm">
                  取消
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Models List */}
        {loading ? (
          <div className="text-center py-20 text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
            加载中...
          </div>
        ) : filteredModels.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            暂无模型，点击右上角新增
          </div>
        ) : (
          <div className="space-y-3">
            {filteredModels.map(model => (
              <Card key={model.id} className={`border-border/50 ${!model.is_active ? 'opacity-50' : ''}`}>
                <CardContent className="py-4">
                  {editingId === model.id ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <Input
                          value={editForm.name}
                          onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                          placeholder="模型名称"
                        />
                        <Input
                          value={editForm.endpoint_id}
                          onChange={e => setEditForm(f => ({ ...f, endpoint_id: e.target.value }))}
                          placeholder="Endpoint ID"
                          className="font-mono text-sm"
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button onClick={() => handleUpdate(model.id)} size="sm" disabled={saving}>
                          {saving ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Check className="w-3 h-3 mr-1" />}
                          保存
                        </Button>
                        <Button onClick={() => setEditingId(null)} variant="outline" size="sm">
                          取消
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{model.name}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            model.category === 'video'
                              ? 'bg-cyan-500/20 text-cyan-400'
                              : 'bg-violet-500/20 text-violet-400'
                          }`}>
                            {model.category === 'video' ? '视频' : '图片'}
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            model.is_active
                              ? 'bg-emerald-500/20 text-emerald-400'
                              : 'bg-red-500/20 text-red-400'
                          }`}>
                            {model.is_active ? '启用' : '禁用'}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground font-mono mt-1 truncate">
                          {model.endpoint_id}
                        </div>
                        {model.description && (
                          <div className="text-xs text-muted-foreground mt-0.5">{model.description}</div>
                        )}
                      </div>
                      <div className="flex items-center gap-1 ml-4">
                        <Button
                          onClick={() => handleToggleActive(model)}
                          variant="ghost"
                          size="sm"
                          className={model.is_active ? 'text-amber-500' : 'text-emerald-500'}
                          title={model.is_active ? '禁用' : '启用'}
                        >
                          {model.is_active ? '禁用' : '启用'}
                        </Button>
                        <Button onClick={() => startEdit(model)} variant="ghost" size="sm" title="编辑">
                          <Edit3 className="w-4 h-4" />
                        </Button>
                        <Button onClick={() => handleDelete(model.id)} variant="ghost" size="sm" className="text-red-500" title="删除">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

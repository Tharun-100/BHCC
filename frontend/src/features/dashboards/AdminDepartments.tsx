import React, { useEffect, useMemo, useState } from 'react';
import { Department } from '../../types';
import {
  createDepartment,
  deleteDepartmentById,
  listDepartments,
  updateDepartment,
} from '../../services/clinicService';
import { PlusCircle, Pencil, Trash2 } from 'lucide-react';

const EMPTY_FORM = {
  name: '',
  icon: 'Stethoscope',
  description: '',
  baseFee: '',
};

const AdminDepartments: React.FC = () => {
  const [rows, setRows] = useState<Department[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);

  const isEdit = useMemo(() => !!editingId, [editingId]);

  const loadRows = async () => {
    const data = await listDepartments();
    setRows(data.sort((a, b) => a.name.localeCompare(b.name)));
  };

  useEffect(() => {
    loadRows().catch(() => setRows([]));
  }, []);

  const resetForm = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const baseFee = Number(form.baseFee);
    if (!form.name.trim() || !form.description.trim() || !form.icon.trim() || Number.isNaN(baseFee) || baseFee <= 0) {
      setError('Please provide valid name, icon, description and base fee.');
      return;
    }

    setIsSaving(true);
    try {
      if (editingId) {
        await updateDepartment(editingId, {
          name: form.name.trim(),
          icon: form.icon.trim(),
          description: form.description.trim(),
          baseFee,
        });
      } else {
        await createDepartment({
          name: form.name.trim(),
          icon: form.icon.trim(),
          description: form.description.trim(),
          baseFee,
        });
      }

      await loadRows();
      resetForm();
    } catch (err: any) {
      setError(err?.message || 'Failed to save department.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleEdit = (row: Department) => {
    setEditingId(row.id);
    setForm({
      name: row.name,
      icon: row.icon,
      description: row.description,
      baseFee: String(row.baseFee),
    });
    setError(null);
  };

  const handleDelete = async (id: string) => {
    const ok = window.confirm('Delete this department?');
    if (!ok) return;
    await deleteDepartmentById(id);
    await loadRows();
    if (editingId === id) resetForm();
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-10">
        <h1 className="text-3xl font-extrabold text-gray-900">Departments</h1>
        <p className="text-gray-500">Create and maintain department catalog shown to patients.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
          <h2 className="text-xl font-bold text-gray-900 mb-4">{isEdit ? 'Edit Department' : 'Add Department'}</h2>
          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              type="text"
              placeholder="Department name"
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              className="w-full px-4 py-3 rounded-xl border border-gray-200"
            />
            <input
              type="text"
              placeholder="Lucide icon name (e.g. HeartPulse)"
              value={form.icon}
              onChange={(e) => setForm((prev) => ({ ...prev, icon: e.target.value }))}
              className="w-full px-4 py-3 rounded-xl border border-gray-200"
            />
            <input
              type="number"
              placeholder="Base fee"
              value={form.baseFee}
              onChange={(e) => setForm((prev) => ({ ...prev, baseFee: e.target.value }))}
              className="w-full px-4 py-3 rounded-xl border border-gray-200"
            />
            <textarea
              placeholder="Description"
              value={form.description}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              rows={4}
              className="w-full px-4 py-3 rounded-xl border border-gray-200"
            />

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={isSaving}
                className="flex-1 py-3 bg-sky-600 text-white rounded-xl font-bold hover:bg-sky-700 disabled:opacity-60 flex items-center justify-center"
              >
                <PlusCircle size={16} className="mr-2" />
                {isEdit ? 'Update' : 'Create'}
              </button>
              {isEdit && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-4 py-3 border border-gray-200 rounded-xl font-bold"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        </div>

        <div className="lg:col-span-2 bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="font-bold text-gray-900">All Departments ({rows.length})</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {rows.map((row) => (
              <div key={row.id} className="px-6 py-4 flex items-start justify-between gap-4">
                <div>
                  <p className="font-bold text-gray-900">{row.name}</p>
                  <p className="text-xs text-gray-500 mb-1">Icon: {row.icon}</p>
                  <p className="text-sm text-gray-600">{row.description}</p>
                  <p className="text-sm font-bold text-sky-700 mt-1">Rs. {row.baseFee}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleEdit(row)} className="p-2 rounded-lg border border-gray-200">
                    <Pencil size={16} />
                  </button>
                  <button onClick={() => handleDelete(row.id)} className="p-2 rounded-lg border border-red-200 text-red-600">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
            {rows.length === 0 && <p className="px-6 py-8 text-sm text-gray-500">No departments found.</p>}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDepartments;

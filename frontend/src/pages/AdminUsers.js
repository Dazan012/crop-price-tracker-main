import { useState, useEffect, useRef } from 'react';
import { adminAPI } from '../services/api';
import {
  Users, Search, Shield, ShieldAlert, ShieldCheck, UserCheck, UserX,
  AlertTriangle, CheckCircle, MoreVertical, X,
} from 'lucide-react';

const ROLE_OPTIONS = ['farmer', 'trader', 'agent', 'admin', 'general'];
const STATUS_OPTIONS = ['approved', 'pending', 'suspended'];

const ROLE_COLORS = {
  admin: '#ef4444',
  agent: '#f59e0b',
  trader: '#3b82f6',
  farmer: '#22c55e',
  general: '#6b7280',
};

const STATUS_COLORS = {
  approved: '#22c55e',
  pending: '#f59e0b',
  suspended: '#ef4444',
};

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Filter state
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [activeFilter, setActiveFilter] = useState('all');

  // Edit modal state
  const [editingUser, setEditingUser] = useState(null);
  const [editForm, setEditForm] = useState({ role: '', approval_status: '', is_active: true });
  const [saving, setSaving] = useState(false);
  const [actionMenuId, setActionMenuId] = useState(null);
  const menuRef = useRef(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setActionMenuId(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await adminAPI.listUsers();
      setUsers(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load users.');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (user) => {
    setEditingUser(user);
    setEditForm({
      role: user.role,
      approval_status: user.approval_status || 'approved',
      is_active: user.is_active !== false,
    });
    setActionMenuId(null);
  };

  const handleSave = async () => {
    if (!editingUser) return;
    setSaving(true);
    try {
      const payload = {};
      if (editForm.role !== editingUser.role) payload.role = editForm.role;
      if (editForm.approval_status !== (editingUser.approval_status || 'approved')) payload.approval_status = editForm.approval_status;
      if (editForm.is_active !== (editingUser.is_active !== false)) payload.is_active = editForm.is_active;

      if (Object.keys(payload).length === 0) {
        setEditingUser(null);
        setSaving(false);
        return;
      }

      await adminAPI.updateUser(editingUser.id, payload);
      setSuccessMsg(`User ${editingUser.username} updated successfully.`);
      setTimeout(() => setSuccessMsg(''), 3000);
      setEditingUser(null);
      fetchUsers();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update user.');
    } finally {
      setSaving(false);
    }
  };

  const handleQuickAction = async (user, action) => {
    setActionMenuId(null);
    try {
      if (action === 'suspend') {
        await adminAPI.updateUser(user.id, { is_active: false });
        setSuccessMsg(`User ${user.username} suspended.`);
      } else if (action === 'activate') {
        await adminAPI.updateUser(user.id, { is_active: true });
        setSuccessMsg(`User ${user.username} activated.`);
      } else if (action === 'approve') {
        await adminAPI.updateUser(user.id, { approval_status: 'approved' });
        setSuccessMsg(`User ${user.username} approved.`);
      }
      setTimeout(() => setSuccessMsg(''), 3000);
      fetchUsers();
    } catch (err) {
      setError(err.response?.data?.error || 'Action failed.');
    }
  };

  // Filtered list
  const filtered = users.filter((u) => {
    if (roleFilter !== 'all' && u.role !== roleFilter) return false;
    if (statusFilter !== 'all' && (u.approval_status || 'approved') !== statusFilter) return false;
    if (activeFilter !== 'all') {
      if (activeFilter === 'active' && u.is_active === false) return false;
      if (activeFilter === 'suspended' && u.is_active !== false) return false;
    }
    if (search) {
      const q = search.toLowerCase();
      return (
        u.username.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.first_name + ' ' + u.last_name).toLowerCase().includes(q) ||
        (u.region || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Stats
  const stats = {
    total: users.length,
    active: users.filter((u) => u.is_active !== false).length,
    suspended: users.filter((u) => u.is_active === false).length,
    pending: users.filter((u) => u.approval_status === 'pending').length,
  };

  const formatDate = (iso) => {
    try {
      return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch { return '—'; }
  };

  return (
    <div className="page">
      <div className="page-header fade-in">
        <div>
          <h1><Users size={28} /> User Management</h1>
          <p>View, manage, and control all platform users</p>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid-4 fade-in" style={{ marginBottom: 24 }}>
        <div className="glass-card stat-card">
          <div className="stat-icon" style={{ background: 'rgba(0,212,170,0.12)', color: '#00d4aa' }}>
            <Users size={20} />
          </div>
          <div className="stat-label">Total Users</div>
          <div className="stat-value">{stats.total}</div>
        </div>
        <div className="glass-card stat-card">
          <div className="stat-icon" style={{ background: 'rgba(34,197,94,0.12)', color: '#22c55e' }}>
            <UserCheck size={20} />
          </div>
          <div className="stat-label">Active</div>
          <div className="stat-value">{stats.active}</div>
        </div>
        <div className="glass-card stat-card">
          <div className="stat-icon" style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444' }}>
            <UserX size={20} />
          </div>
          <div className="stat-label">Suspended</div>
          <div className="stat-value">{stats.suspended}</div>
        </div>
        <div className="glass-card stat-card">
          <div className="stat-icon" style={{ background: 'rgba(245,158,11,0.12)', color: '#f59e0b' }}>
            <ShieldAlert size={20} />
          </div>
          <div className="stat-label">Pending Approval</div>
          <div className="stat-value">{stats.pending}</div>
        </div>
      </div>

      {/* Success / Error messages */}
      {successMsg && (
        <div className="insight-banner fade-in-up" style={{ marginBottom: 20, borderColor: 'rgba(34,197,94,0.3)', background: 'rgba(34,197,94,0.06)' }}>
          <CheckCircle size={18} style={{ color: '#22c55e' }} />
          <span style={{ color: '#22c55e' }}>{successMsg}</span>
        </div>
      )}
      {error && (
        <div style={{
          padding: '10px 14px', background: 'var(--danger-bg)',
          border: '1px solid rgba(239,68,68,0.2)', borderRadius: 'var(--radius-sm)',
          fontSize: '0.825rem', color: 'var(--danger)', marginBottom: 20,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <AlertTriangle size={14} style={{ flexShrink: 0 }} />
          {error}
          <button onClick={() => setError('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)' }}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="glass-card fade-in" style={{ padding: '16px 20px', marginBottom: 20 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: '1 1 240px' }}>
            <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              className="form-control"
              placeholder="Search by username, email, name, or region..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ paddingLeft: 36, fontSize: '0.85rem' }}
            />
          </div>
          <select className="form-control" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} style={{ width: 'auto', minWidth: 130, fontSize: '0.85rem' }}>
            <option value="all">All Roles</option>
            {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
          </select>
          <select className="form-control" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ width: 'auto', minWidth: 140, fontSize: '0.85rem' }}>
            <option value="all">All Statuses</option>
            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
          </select>
          <select className="form-control" value={activeFilter} onChange={(e) => setActiveFilter(e.target.value)} style={{ width: 'auto', minWidth: 130, fontSize: '0.85rem' }}>
            <option value="all">Active & Suspended</option>
            <option value="active">Active Only</option>
            <option value="suspended">Suspended Only</option>
          </select>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            {filtered.length} of {users.length} users
          </span>
        </div>
      </div>

      {/* Users Table */}
      <div className="glass-card fade-in" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div className="loading-spinner" style={{ padding: 60 }}>
            <div className="spinner" />
            <p>Loading users...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)' }}>
            <Users size={32} style={{ marginBottom: 12, opacity: 0.4 }} />
            <p>No users match your filters.</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Region</th>
                  <th>Joined</th>
                  <th>State</th>
                  <th style={{ width: 60 }}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => (
                  <tr key={u.id} style={{ opacity: u.is_active === false ? 0.6 : 1 }}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                          background: `linear-gradient(135deg, ${ROLE_COLORS[u.role] || '#6b7280'}, var(--accent-dark))`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '0.8rem', fontWeight: 700, color: '#000',
                        }}>
                          {(u.first_name || u.username || '?')[0].toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.875rem' }}>
                            {u.first_name || u.last_name ? `${u.first_name || ''} ${u.last_name || ''}`.trim() : u.username}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>@{u.username} &middot; {u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span style={{
                        display: 'inline-block', padding: '3px 10px', borderRadius: 20,
                        fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase',
                        background: `${ROLE_COLORS[u.role] || '#6b7280'}20`,
                        color: ROLE_COLORS[u.role] || '#6b7280',
                        border: `1px solid ${ROLE_COLORS[u.role] || '#6b7280'}40`,
                      }}>
                        {u.role}
                      </span>
                    </td>
                    <td>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        fontSize: '0.78rem', fontWeight: 500,
                        color: STATUS_COLORS[u.approval_status || 'approved'] || '#6b7280',
                      }}>
                        {u.approval_status === 'pending' && <ShieldAlert size={13} />}
                        {u.approval_status === 'suspended' && <ShieldAlert size={13} />}
                        {u.approval_status === 'approved' && <ShieldCheck size={13} />}
                        {(u.approval_status || 'approved').charAt(0).toUpperCase() + (u.approval_status || 'approved').slice(1)}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{u.region || '—'}</td>
                    <td style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{formatDate(u.date_joined)}</td>
                    <td>
                      {u.is_active === false ? (
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#ef4444' }}>Suspended</span>
                      ) : (
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#22c55e' }}>Active</span>
                      )}
                    </td>
                    <td>
                      <div style={{ position: 'relative' }}>
                        <button
                          onClick={() => setActionMenuId(actionMenuId === u.id ? null : u.id)}
                          style={{
                            background: 'none', border: 'none', cursor: 'pointer', padding: 6,
                            color: 'var(--text-muted)', borderRadius: 6,
                          }}
                        >
                          <MoreVertical size={16} />
                        </button>
                        {actionMenuId === u.id && (
                          <div ref={menuRef} style={{
                            position: 'absolute', right: 0, top: '100%', zIndex: 100,
                            background: 'var(--bg-card)', border: '1px solid var(--border)',
                            borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
                            minWidth: 160, padding: 4,
                          }}>
                            <button onClick={() => handleEdit(u)} style={menuItemStyle}>
                              <Shield size={14} /> Edit User
                            </button>
                            {u.is_active === false ? (
                              <button onClick={() => handleQuickAction(u, 'activate')} style={{ ...menuItemStyle, color: '#22c55e' }}>
                                <UserCheck size={14} /> Activate
                              </button>
                            ) : (
                              <button onClick={() => handleQuickAction(u, 'suspend')} style={{ ...menuItemStyle, color: '#ef4444' }}>
                                <UserX size={14} /> Suspend
                              </button>
                            )}
                            {u.approval_status === 'pending' && (
                              <button onClick={() => handleQuickAction(u, 'approve')} style={{ ...menuItemStyle, color: '#22c55e' }}>
                                <CheckCircle size={14} /> Approve
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {editingUser && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.6)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', padding: 20,
        }} onClick={() => setEditingUser(null)}>
          <div className="glass-card fade-in" style={{ padding: 28, maxWidth: 480, width: '100%' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
              <h2 style={{ margin: 0, fontSize: '1.1rem' }}>
                <Shield size={18} style={{ marginRight: 8, verticalAlign: 'middle', color: 'var(--accent)' }} />
                Edit User
              </h2>
              <button onClick={() => setEditingUser(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: '14px 16px', borderRadius: 8, background: 'var(--bg-glass)', marginBottom: 20, border: '1px solid var(--border)' }}>
              <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>
                {editingUser.first_name || editingUser.last_name
                  ? `${editingUser.first_name} ${editingUser.last_name}`.trim()
                  : editingUser.username}
              </div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                @{editingUser.username} &middot; {editingUser.email}
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: 16 }}>
              <label>Role</label>
              <select className="form-control" value={editForm.role} onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}>
                {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: 16 }}>
              <label>Approval Status</label>
              <select className="form-control" value={editForm.approval_status} onChange={(e) => setEditForm({ ...editForm, approval_status: e.target.value })}>
                {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: 24 }}>
              <label>Account State</label>
              <div style={{ display: 'flex', gap: 12 }}>
                <button
                  type="button"
                  onClick={() => setEditForm({ ...editForm, is_active: true })}
                  style={{
                    flex: 1, padding: '10px 16px', borderRadius: 8, cursor: 'pointer',
                    border: editForm.is_active ? '2px solid #22c55e' : '1px solid var(--border)',
                    background: editForm.is_active ? 'rgba(34,197,94,0.1)' : 'transparent',
                    color: editForm.is_active ? '#22c55e' : 'var(--text-muted)',
                    fontWeight: 600, fontSize: '0.85rem',
                  }}
                >
                  <UserCheck size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                  Active
                </button>
                <button
                  type="button"
                  onClick={() => setEditForm({ ...editForm, is_active: false })}
                  style={{
                    flex: 1, padding: '10px 16px', borderRadius: 8, cursor: 'pointer',
                    border: !editForm.is_active ? '2px solid #ef4444' : '1px solid var(--border)',
                    background: !editForm.is_active ? 'rgba(239,68,68,0.1)' : 'transparent',
                    color: !editForm.is_active ? '#ef4444' : 'var(--text-muted)',
                    fontWeight: 600, fontSize: '0.85rem',
                  }}
                >
                  <UserX size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                  Suspended
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ flex: 1, justifyContent: 'center' }}>
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
              <button className="btn btn-secondary" onClick={() => setEditingUser(null)} disabled={saving}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const menuItemStyle = {
  display: 'flex', alignItems: 'center', gap: 8,
  width: '100%', padding: '8px 12px', border: 'none',
  background: 'none', cursor: 'pointer', fontSize: '0.82rem',
  color: 'var(--text-primary)', borderRadius: 6, textAlign: 'left',
};

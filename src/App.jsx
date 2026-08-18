import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';

export default function App() {
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [space, setSpace] = useState(null);
  const [inviteInput, setInviteInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [myContent, setMyContent] = useState('');
  const [partnerContent, setPartnerContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // 1. 初始化检查登录状态与绑定状态
  useEffect(() => {
    const timer = setTimeout(() => {
      setLoading(false);
    }, 3000);
    checkUserAndSpace().finally(() => {
      clearTimeout(timer);
    });
  }, []);

  // 2. 进入空间时，加载双方内容
  useEffect(() => {
    if (space) {
      const isUser1 = space.user_1 === user.id;
      setMyContent(isUser1 ? (space.content_left || '') : (space.content_right || ''));
      setPartnerContent(isUser1 ? (space.content_right || '') : (space.content_left || ''));
    }
  }, [space?.id]);

  async function checkUserAndSpace() {
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUser(session.user);
        await fetchUserSpace(session.user.id);
      }
    } catch (err) {
      console.error('初始化登录检查失败:', err);
    } finally {
      setLoading(false);
    }
  }

  async function fetchUserSpace(userId) {
    const { data, error } = await supabase
      .from('spaces')
      .select('*')
      .or(`user_1.eq.${userId},user_2.eq.${userId}`)
      .single();
    if (data) {
      setSpace(data);
    }
  }

  // 3. 账号注册 / 登录
  async function handleAuth(type) {
    let result;
    if (type === 'signup') {
      result = await supabase.auth.signUp({ email, password });
    } else {
      result = await supabase.auth.signInWithPassword({ email, password });
    }
    if (result.error) {
      alert(result.error.message);
    } else if (result.data.user) {
      setUser(result.data.user);
      fetchUserSpace(result.data.user.id);
    }
  }

  // 4. 创建共享空间
  async function createSpace() {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const { data, error } = await supabase
      .from('spaces')
      .insert([{ invite_code: code, user_1: user.id }])
      .select()
      .single();
    if (error) alert(error.message);
    else setSpace(data);
  }

  // 5. 加入共享空间
  async function joinSpace() {
    const cleanCode = inviteInput.trim().toUpperCase();
    if (!cleanCode) return alert('请输入邀请码！');

    const { data: targetSpace, error: findError } = await supabase
      .from('spaces')
      .select('*')
      .eq('invite_code', cleanCode)
      .maybeSingle();

    if (findError) {
      alert('查询出错：' + findError.message);
      return;
    }
    if (!targetSpace) {
      alert('未找到该邀请码，请检查是否输入正确！');
      return;
    }
    if (targetSpace.user_1 === user.id) {
      alert('不能使用自己生成的邀请码！');
      return;
    }
    if (targetSpace.user_2) {
      alert('该邀请码已被其他人绑定使用！');
      return;
    }

    const { data, error } = await supabase
      .from('spaces')
      .update({ user_2: user.id })
      .eq('id', targetSpace.id)
      .select()
      .single();
    if (error) {
      alert('加入空间失败：' + error.message);
    } else {
      setSpace(data);
      alert('🎉 成功加入双人空间！');
    }
  }

  // 6. 取消邀请
  async function cancelSpace() {
    if (!space) return;
    const confirmCancel = window.confirm('确定要取消邀请吗？取消后邀请码将作废，你可以重新创建或输入别人的邀请码。');
    if (!confirmCancel) return;
    const { error } = await supabase
      .from('spaces')
      .delete()
      .eq('id', space.id);
    if (error) {
      alert('取消失败：' + error.message);
    } else {
      setSpace(null);
    }
  }

  // 7. 【新增】保存我的内容（只上传，不管对方）
  async function handleSave() {
    if (!space) return;
    setSaving(true);

    try {
      const isUser1 = space.user_1 === user.id;
      const myField = isUser1 ? 'content_left' : 'content_right';

      const { error } = await supabase
        .from('spaces')
        .update({ [myField]: myContent })
        .eq('id', space.id);

      if (error) {
        alert('保存失败：' + error.message);
      } else {
        alert('✅ 保存成功！对方点刷新就能看到了。');
      }
    } catch (err) {
      alert('保存出错：' + err.message);
    } finally {
      setSaving(false);
    }
  }

  // 8. 【新增】刷新对方内容（只下载，不动我的）
  async function handleRefresh() {
    if (!space) return;
    setRefreshing(true);

    try {
      const isUser1 = space.user_1 === user.id;
      const partnerField = isUser1 ? 'content_right' : 'content_left';

      const { data: latestSpace, error } = await supabase
        .from('spaces')
        .select('*')
        .eq('id', space.id)
        .single();

      if (error) {
        alert('刷新失败：' + error.message);
      } else {
        setPartnerContent(latestSpace[partnerField] || '');
        setSpace(latestSpace);
      }
    } catch (err) {
      alert('刷新出错：' + err.message);
    } finally {
      setRefreshing(false);
    }
  }

  // 退出登录
  async function handleLogout() {
    await supabase.auth.signOut();
    setUser(null);
    setSpace(null);
    setMyContent('');
    setPartnerContent('');
  }

  if (loading) return <div style={{ padding: 20 }}>加载中...</div>;

  // 界面 1：未登录
  if (!user) {
    return (
      <div style={cardStyle}>
        <h2>双人手账 - 登录 / 注册</h2>
        <input
          placeholder="邮箱"
          value={email}
          onChange={e => setEmail(e.target.value)}
          style={inputStyle}
        />
        <input
          type="password"
          placeholder="密码"
          value={password}
          onChange={e => setPassword(e.target.value)}
          style={inputStyle}
        />
        <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
          <button onClick={() => handleAuth('login')} style={btnStyle}>登录</button>
          <button onClick={() => handleAuth('signup')} style={{...btnStyle, backgroundColor: '#4CAF50'}}>注册账号</button>
        </div>
      </div>
    );
  }

  // 界面 2：已登录但未绑定
  if (!space) {
    return (
      <div style={cardStyle}>
        <h3>欢迎你，{user.email}！</h3>
        <p>你还没有与另一半绑定双人空间哦：</p>

        <div style={{ borderTop: '1px solid #ccc', paddingTop: 15, marginTop: 15 }}>
          <h4>方式 A：我是发起人</h4>
          <button onClick={createSpace} style={btnStyle}>生成专属邀请码</button>
        </div>
        <div style={{ borderTop: '1px solid #ccc', paddingTop: 15, marginTop: 15 }}>
          <h4>方式 B：我有对方的邀请码</h4>
          <input
            placeholder="输入6位邀请码"
            value={inviteInput}
            onChange={e => setInviteInput(e.target.value)}
            style={inputStyle}
          />
          <button onClick={joinSpace} style={{...btnStyle, backgroundColor: '#2196F3'}}>加入对方的空间</button>
        </div>
        <button onClick={handleLogout} style={{ marginTop: 20, background: '#9e9e9e', ...btnStyle }}>退出登录</button>
      </div>
    );
  }

  // 界面 3：已绑定 - 左右分栏（保存和刷新分开）
  return (
    <div style={{ padding: 20, height: '100vh', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
        <h2 style={{ margin: 0 }}>💕 我们的共享双人手账</h2>
        <button onClick={handleLogout} style={{ background: '#9e9e9e', ...btnStyle }}>退出登录</button>
      </div>

      {!space.user_2 ? (
        <div style={{ backgroundColor: '#fff3f8', padding: 15, borderRadius: 8, marginBottom: 15 }}>
          <p><b>你的邀请码：</b><span style={{ color: '#e91e63', fontWeight: 'bold', fontSize: 18 }}>{space.invite_code}</span></p>
          <p><b>绑定状态：</b>⏳ 正在等待对方输入邀请码加入...</p>
          <button
            onClick={cancelSpace}
            style={{ ...btnStyle, backgroundColor: '#f44336' }}
          >
            取消邀请 / 作废邀请码
          </button>
        </div>
      ) : null}

      {/* 左右分栏 */}
      <div style={{ display: 'flex', gap: '15px', flex: 1, minHeight: 0 }}>
        {/* 左边：我的编辑区 + 保存按钮 */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{
            backgroundColor: '#e3f2fd',
            padding: '10px 15px',
            borderRadius: '8px 8px 0 0',
            fontWeight: 'bold',
            color: '#1976d2',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <span>✏️ 我的区域</span>
          </div>
          <textarea
            value={myContent}
            onChange={e => setMyContent(e.target.value)}
            placeholder="在这里写下你想说的话..."
            style={{
              flex: 1,
              padding: '15px',
              fontSize: '16px',
              border: '2px solid #90caf9',
              borderTop: 'none',
              borderRadius: 0,
              resize: 'none',
              outline: 'none',
              fontFamily: 'inherit',
              lineHeight: '1.6'
            }}
          />
          <div style={{
            border: '2px solid #90caf9',
            borderTop: 'none',
            borderRadius: '0 0 8px 8px',
            padding: '10px',
            textAlign: 'center',
            backgroundColor: '#f5f9ff'
          }}>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                ...btnStyle,
                backgroundColor: saving ? '#9e9e9e' : '#2196F3',
                fontSize: '15px',
                padding: '8px 24px'
              }}
            >
              {saving ? '保存中...' : '💾 保存我的内容'}
            </button>
          </div>
        </div>

        {/* 右边：对方的区域 + 刷新按钮 */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{
            backgroundColor: '#fce4ec',
            padding: '10px 15px',
            borderRadius: '8px 8px 0 0',
            fontWeight: 'bold',
            color: '#c2185b',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <span>💌 对方的区域</span>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              style={{
                padding: '4px 12px',
                backgroundColor: refreshing ? '#9e9e9e' : '#e91e63',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 'bold'
              }}
            >
              {refreshing ? '刷新中...' : '🔄 刷新'}
            </button>
          </div>
          <div style={{
            flex: 1,
            padding: '15px',
            fontSize: '16px',
            border: '2px solid #f48fb1',
            borderTop: 'none',
            borderRadius: '0 0 8px 8px',
            backgroundColor: '#fffafa',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            overflowY: 'auto',
            lineHeight: '1.6'
          }}>
            {partnerContent || <span style={{ color: '#ccc' }}>对方还没有写内容，点右上角"刷新"看看...</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

const cardStyle = {
  maxWidth: '400px',
  margin: '50px auto',
  padding: '20px',
  border: '1px solid #ddd',
  borderRadius: '10px',
  boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
  fontFamily: 'sans-serif'
};

const inputStyle = {
  width: '100%',
  padding: '8px',
  margin: '8px 0',
  boxSizing: 'border-box'
};

const btnStyle = {
  padding: '8px 16px',
  backgroundColor: '#ff69b4',
  color: 'white',
  border: 'none',
  borderRadius: '5px',
  cursor: 'pointer',
  fontWeight: 'bold'
};

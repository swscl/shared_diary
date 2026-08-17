import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

export default function App() {
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [space, setSpace] = useState(null);
  const [inviteInput, setInviteInput] = useState('');
  const [loading, setLoading] = useState(true);

// 1. 初始化检查登录状态与绑定状态（带超时保护，防止手机端死锁卡在“加载中”）
  useEffect(() => {
    // 设置 3 秒超时保底，防止手机浏览器阻断回调导致一直卡在加载页
    const timer = setTimeout(() => {
      setLoading(false);
    }, 3000);

    checkUserAndSpace().finally(() => {
      clearTimeout(timer);
    });
  }, []);

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

  // 查询用户是否已经拥有共享空间
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

  // 2. 账号注册 / 登录
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

  // 3. 用户 A：创建新的共享空间并生成邀请码
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

  // 用户 B：输入邀请码进行双人绑定
  async function joinSpace() {
    // 自动去除输入内容的前后空格并转大写
    const cleanCode = inviteInput.trim().toUpperCase();

    if (!cleanCode) return alert('请输入邀请码！');

    // 1. 查找到对应邀请码的空间
    const { data: targetSpace, error: findError } = await supabase
      .from('spaces')
      .select('*')
      .eq('invite_code', cleanCode)
      .maybeSingle(); // 使用 maybeSingle 避免找不到时抛出异常错误

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

    // 2. 将用户 B 的 ID 填入 user_2 字段进行绑定
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

  // 5. 【新增】取消邀请：作废邀请码并返回上一步
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
      setSpace(null); // 清空本地 space 状态，页面会自动跳回上一个选择界面
    }
  }

  // 退出登录
  async function handleLogout() {
    await supabase.auth.signOut();
    setUser(null);
    setSpace(null);
  }

  if (loading) return <div style={{ padding: 20 }}>加载中...</div>;

  // 界面 1：未登录界面
  if (!user) {
    return (
      <div style={cardStyle}>
        <h2>心之田 - 登录 / 注册</h2>
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

  // 界面 2：已登录但未绑定对方（上一个选择界面）
  if (!space) {
    return (
      <div style={cardStyle}>
        <h3>欢迎你，{user.email}！</h3>
        <p>你还没有与另一半绑定心之田空间哦：</p>
        
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

  // 界面 3：空间管理与手账区域
  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>💕 我们的心之田 </h2>
        <button onClick={handleLogout} style={{ background: '#9e9e9e', ...btnStyle }}>退出登录</button>
      </div>

      <div style={{ backgroundColor: '#fff3f8', padding: 15, borderRadius: 8, marginBottom: 20 }}>
        <p><b>空间 ID：</b>{space.id}</p>
        
        {/* 如果没绑定 user_2，显示邀请码和取消按钮 */}
        {!space.user_2 ? (
          <div>
            <p><b>你的邀请码：</b><span style={{ color: '#e91e63', fontWeight: 'bold', fontSize: 18 }}>{space.invite_code}</span></p>
            <p><b>绑定状态：</b>⏳ 正在等待对方输入邀请码加入...</p>
            
            {/* 取消邀请按钮 */}
            <button 
              onClick={cancelSpace} 
              style={{ ...btnStyle, backgroundColor: '#f44336', marginTop: 10 }}
            >
              取消邀请 / 作废邀请码
            </button>
          </div>
        ) : (
          <p><b>绑定状态：</b>✅ 已完成双人绑定！两人可以共同编辑手账了。</p>
        )}
      </div>

      {/* Fabric.js 手账画板区域 */}
      <div style={{ border: '2px dashed #ffb6c1', padding: 20, textAlign: 'center', backgroundColor: '#fdfbf7' }}>
        <h3>[ 记录区域 ]</h3>
        <p>已自动连接至空间：{space.id}</p>
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
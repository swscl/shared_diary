import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';

export default function App() {
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [space, setSpace] = useState(null);
  const [inviteInput, setInviteInput] = useState('');
  const [loading, setLoading] = useState(true);

  // 心之田主页相关
  const [posts, setPosts] = useState([]);
  const [filterType, setFilterType] = useState('all'); // all / me / partner
  const [filterDate, setFilterDate] = useState('');
  const [postsLoading, setPostsLoading] = useState(false);

  // 新建帖子页相关
  const [showNewPost, setShowNewPost] = useState(false);
  const [newContent, setNewContent] = useState('');
  const [newImages, setNewImages] = useState([]); // {file, previewUrl}
  const [publishing, setPublishing] = useState(false);
  const fileInputRef = useRef(null);

  // 1. 初始化
  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 3000);
    checkUserAndSpace().finally(() => clearTimeout(timer));
  }, []);

  // 2. 进入空间后加载帖子
  useEffect(() => {
    if (space) loadPosts();
  }, [space?.id, filterType, filterDate]);

  async function checkUserAndSpace() {
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUser(session.user);
        await fetchUserSpace(session.user.id);
      }
    } catch (err) {
      console.error('初始化失败:', err);
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
    if (data) setSpace(data);
  }

  // 3. 加载帖子列表
  async function loadPosts() {
    if (!space) return;
    setPostsLoading(true);
    try {
      let query = supabase
        .from('posts')
        .select('*')
        .eq('space_id', space.id)
        .order('created_at', { ascending: false });

      // 按人筛选
      if (filterType === 'me') {
        query = query.eq('user_id', user.id);
      } else if (filterType === 'partner') {
        const partnerId = space.user_1 === user.id ? space.user_2 : space.user_1;
        query = query.eq('user_id', partnerId);
      }

      // 按日期筛选
      if (filterDate) {
        const start = new Date(filterDate + 'T00:00:00').toISOString();
        const end = new Date(filterDate + 'T23:59:59').toISOString();
        query = query.gte('created_at', start).lte('created_at', end);
      }

      const { data, error } = await query;
      if (error) throw error;
      setPosts(data || []);
    } catch (err) {
      console.error('加载帖子失败:', err);
      alert('加载帖子失败：' + err.message);
    } finally {
      setPostsLoading(false);
    }
  }

  // 4. 登录/注册
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

  // 5. 创建空间
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

  // 6. 加入空间
  async function joinSpace() {
    const cleanCode = inviteInput.trim().toUpperCase();
    if (!cleanCode) return alert('请输入邀请码！');

    const { data: targetSpace, error: findError } = await supabase
      .from('spaces')
      .select('*')
      .eq('invite_code', cleanCode)
      .maybeSingle();

    if (findError) return alert('查询出错：' + findError.message);
    if (!targetSpace) return alert('未找到该邀请码！');
    if (targetSpace.user_1 === user.id) return alert('不能使用自己的邀请码！');
    if (targetSpace.user_2) return alert('该邀请码已被使用！');

    const { data, error } = await supabase
      .from('spaces')
      .update({ user_2: user.id })
      .eq('id', targetSpace.id)
      .select()
      .single();
    if (error) {
      alert('加入失败：' + error.message);
    } else {
      setSpace(data);
      alert('🎉 成功加入双人空间！');
    }
  }

  // 7. 取消邀请
  async function cancelSpace() {
    if (!space) return;
    if (!window.confirm('确定取消邀请吗？')) return;
    const { error } = await supabase.from('spaces').delete().eq('id', space.id);
    if (error) alert('取消失败：' + error.message);
    else setSpace(null);
  }

  // 8. 选择图片
  function handleImageSelect(e) {
    const files = Array.from(e.target.files || []);
    const remaining = 9 - newImages.length;
    const toAdd = files.slice(0, remaining).map(file => ({
      file,
      previewUrl: URL.createObjectURL(file)
    }));
    setNewImages([...newImages, ...toAdd]);
    if (files.length > remaining) {
      alert(`最多只能上传9张图片，已自动截取前${remaining}张。`);
    }
  }

  function removeImage(index) {
    const updated = [...newImages];
    URL.revokeObjectURL(updated[index].previewUrl);
    updated.splice(index, 1);
    setNewImages(updated);
  }

  // 9. 上传图片到 Storage
  async function uploadImages() {
    const urls = [];
    for (const item of newImages) {
      const ext = item.file.name.split('.').pop() || 'jpg';
      const path = `${space.id}/${user.id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage
        .from('post-images')
        .upload(path, item.file, { contentType: item.file.type });
      if (error) throw error;
      const { data } = supabase.storage.from('post-images').getPublicUrl(path);
      urls.push(data.publicUrl);
    }
    return urls;
  }

  // 10. 发布帖子
  async function handlePublish() {
    if (!newContent.trim() && newImages.length === 0) {
      return alert('写点什么或加张图片吧～');
    }
    setPublishing(true);
    try {
      const imageUrls = await uploadImages();
      const { error } = await supabase
        .from('posts')
        .insert([{
          space_id: space.id,
          user_id: user.id,
          content: newContent.trim(),
          images: imageUrls
        }]);
      if (error) throw error;

      // 重置并返回
      setNewContent('');
      newImages.forEach(img => URL.revokeObjectURL(img.previewUrl));
      setNewImages([]);
      setShowNewPost(false);
      loadPosts(); // 刷新列表
    } catch (err) {
      alert('发布失败：' + err.message);
    } finally {
      setPublishing(false);
    }
  }

  // 11. 删除帖子
  async function handleDeletePost(postId) {
    if (!window.confirm('确定删除这条帖子吗？')) return;
    const { error } = await supabase.from('posts').delete().eq('id', postId);
    if (error) {
      alert('删除失败：' + error.message);
    } else {
      setPosts(posts.filter(p => p.id !== postId));
    }
  }

  // 12. 退出登录
  async function handleLogout() {
    await supabase.auth.signOut();
    setUser(null);
    setSpace(null);
    setPosts([]);
  }

  // 工具：格式化时间
  function formatTime(dateStr) {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = (now - d) / 1000;
    if (diff < 60) return '刚刚';
    if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}天前`;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  // 判断是不是自己的帖子
  function isMyPost(post) {
    return post.user_id === user.id;
  }

  // 获取作者显示名
  function getAuthorName(post) {
    return isMyPost(post) ? '我' : 'TA';
  }

  if (loading) return <div style={styles.loading}>加载中...</div>;

  // ========== 页面1：登录页 ==========
  if (!user) {
    return (
      <div style={styles.card}>
        <h2 style={styles.loginTitle}>💕 心之田</h2>
        <p style={styles.loginSubtitle}>两个人的共享小天地</p>
        <input placeholder="邮箱" value={email} onChange={e => setEmail(e.target.value)} style={styles.input} />
        <input type="password" placeholder="密码" value={password} onChange={e => setPassword(e.target.value)} style={styles.input} />
        <div style={{ display: 'flex', gap: 10, marginTop: 15 }}>
          <button onClick={() => handleAuth('login')} style={styles.btnPrimary}>登录</button>
          <button onClick={() => handleAuth('signup')} style={styles.btnSuccess}>注册</button>
        </div>
      </div>
    );
  }

  // ========== 页面2：绑定空间页 ==========
  if (!space) {
    return (
      <div style={styles.card}>
        <h3>欢迎你，{user.email}！</h3>
        <p>还没有绑定双人空间哦～</p>
        <div style={styles.divider}>
          <h4>🌸 我是发起人</h4>
          <button onClick={createSpace} style={styles.btnPrimary}>生成邀请码</button>
        </div>
        <div style={styles.divider}>
          <h4>🌷 我有邀请码</h4>
          <input placeholder="输入6位邀请码" value={inviteInput} onChange={e => setInviteInput(e.target.value)} style={styles.input} />
          <button onClick={joinSpace} style={styles.btnInfo}>加入空间</button>
        </div>
        <button onClick={handleLogout} style={{ ...styles.btnPrimary, background: '#9e9e9e', marginTop: 20 }}>退出登录</button>
      </div>
    );
  }

  // ========== 页面4：新建帖子页 ==========
  if (showNewPost) {
    return (
      <div style={styles.newPostPage}>
        <div style={styles.newPostHeader}>
          <button onClick={() => {
            setShowNewPost(false);
            setNewContent('');
            newImages.forEach(img => URL.revokeObjectURL(img.previewUrl));
            setNewImages([]);
          }} style={styles.cancelBtn}>取消</button>
          <span style={styles.newPostTitle}>发布新帖</span>
          <button onClick={handlePublish} disabled={publishing} style={{ ...styles.publishBtn, opacity: publishing ? 0.5 : 1 }}>
            {publishing ? '发布中...' : '发布'}
          </button>
        </div>
        <textarea
          value={newContent}
          onChange={e => setNewContent(e.target.value)}
          placeholder="此刻的心情..."
          style={styles.newPostTextarea}
        />
        <div style={styles.imageGrid}>
          {newImages.map((img, i) => (
            <div key={i} style={styles.imageWrapper}>
              <img src={img.previewUrl} alt="" style={styles.imagePreview} />
              <button onClick={() => removeImage(i)} style={styles.removeImgBtn}>×</button>
            </div>
          ))}
          {newImages.length < 9 && (
            <div onClick={() => fileInputRef.current?.click()} style={styles.addImageBtn}>
              <span style={{ fontSize: 30, color: '#ccc' }}>+</span>
              <span style={{ fontSize: 12, color: '#999' }}>添加图片</span>
            </div>
          )}
        </div>
        <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleImageSelect} style={{ display: 'none' }} />
        <p style={{ textAlign: 'center', color: '#999', fontSize: 13 }}>最多9张图片（{newImages.length}/9）</p>
      </div>
    );
  }

  // ========== 页面3：心之田主页 ==========
  return (
    <div style={styles.homePage}>
      {/* 顶部标题栏 */}
      <div style={styles.header}>
        <h2 style={{ margin: 0, color: '#d63384' }}>💕 心之田</h2>
        <button onClick={handleLogout} style={styles.logoutBtn}>退出</button>
      </div>

      {/* 未绑定提示 */}
      {!space.user_2 && (
        <div style={styles.inviteBanner}>
          <p>你的邀请码：<b style={{ color: '#d63384', fontSize: 18 }}>{space.invite_code}</b></p>
          <p>⏳ 等待对方加入...</p>
          <button onClick={cancelSpace} style={{ ...styles.btnPrimary, background: '#dc3545', fontSize: 13, padding: '5px 12px' }}>取消邀请</button>
        </div>
      )}

      {/* 筛选栏 */}
      <div style={styles.filterBar}>
        <div style={styles.filterTabs}>
          <button onClick={() => setFilterType('all')} style={{ ...styles.filterTab, background: filterType === 'all' ? '#ff69b4' : '#f5f5f5', color: filterType === 'all' ? 'white' : '#666' }}>全部</button>
          <button onClick={() => setFilterType('me')} style={{ ...styles.filterTab, background: filterType === 'me' ? '#ff69b4' : '#f5f5f5', color: filterType === 'me' ? 'white' : '#666' }}>我的</button>
          <button onClick={() => setFilterType('partner')} style={{ ...styles.filterTab, background: filterType === 'partner' ? '#ff69b4' : '#f5f5f5', color: filterType === 'partner' ? 'white' : '#666' }}>TA的</button>
        </div>
        <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} style={styles.dateInput} />
        {filterDate && <button onClick={() => setFilterDate('')} style={styles.clearDateBtn}>清除</button>}
      </div>

      {/* 帖子列表 */}
      <div style={styles.postList}>
        {postsLoading ? (
          <div style={styles.emptyState}>加载中...</div>
        ) : posts.length === 0 ? (
          <div style={styles.emptyState}>
            <div style={{ fontSize: 48, marginBottom: 10 }}>🌱</div>
            <p>还没有帖子，点右下角加号发布第一条吧～</p>
          </div>
        ) : (
          posts.map(post => (
            <div key={post.id} style={styles.postCard}>
              <div style={styles.postHeader}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ ...styles.avatar, background: isMyPost(post) ? '#ff69b4' : '#9c27b0' }}>
                    {getAuthorName(post)}
                  </div>
                  <div>
                    <div style={{ fontWeight: 'bold', color: '#333' }}>{getAuthorName(post)}</div>
                    <div style={{ fontSize: 12, color: '#999' }}>{formatTime(post.created_at)}</div>
                  </div>
                </div>
                {isMyPost(post) && (
                  <button onClick={() => handleDeletePost(post.id)} style={styles.deleteBtn}>删除</button>
                )}
              </div>
              {post.content && <div style={styles.postContent}>{post.content}</div>}
              {post.images && post.images.length > 0 && (
                <div style={styles.postImages}>
                  {post.images.map((url, i) => (
                    <img key={i} src={url} alt="" style={styles.postImage} />
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* 右下角新建按钮 */}
      <button onClick={() => setShowNewPost(true)} style={styles.fab}>
        <span style={{ fontSize: 28 }}>+</span>
      </button>
    </div>
  );
}

// ==================== 样式 ====================
const styles = {
  loading: { padding: 20, textAlign: 'center', marginTop: 50 },
  card: {
    maxWidth: 400, margin: '50px auto', padding: 30,
    border: '1px solid #ffd6e8', borderRadius: 16,
    boxShadow: '0 4px 20px rgba(255,105,180,0.15)',
    fontFamily: 'sans-serif', background: '#fffafa'
  },
  loginTitle: { textAlign: 'center', color: '#d63384', marginBottom: 5 },
  loginSubtitle: { textAlign: 'center', color: '#999', marginTop: 0, marginBottom: 25 },
  input: { width: '100%', padding: '12px', margin: '8px 0', boxSizing: 'border-box', borderRadius: 8, border: '1px solid #ffd6e8', outline: 'none', fontSize: 15 },
  btnPrimary: { padding: '10px 20px', backgroundColor: '#ff69b4', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold', fontSize: 15, flex: 1 },
  btnSuccess: { padding: '10px 20px', backgroundColor: '#4CAF50', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold', fontSize: 15, flex: 1 },
  btnInfo: { padding: '10px 20px', backgroundColor: '#2196F3', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold', fontSize: 15, width: '100%', marginTop: 8 },
  divider: { borderTop: '1px solid #ffd6e8', paddingTop: 15, marginTop: 15 },
  // 主页
  homePage: { maxWidth: 600, margin: '0 auto', minHeight: '100vh', background: '#fffafa', position: 'relative', paddingBottom: 80 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 20px', background: 'linear-gradient(135deg, #ff69b4, #ff8fab)', position: 'sticky', top: 0, zIndex: 10 },
  logoutBtn: { padding: '6px 14px', background: 'rgba(255,255,255,0.3)', color: 'white', border: 'none', borderRadius: 20, cursor: 'pointer', fontWeight: 'bold' },
  inviteBanner: { background: '#fff0f5', padding: 15, margin: 15, borderRadius: 12, textAlign: 'center', border: '1px dashed #ff69b4' },
  filterBar: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 20px', background: 'white', borderBottom: '1px solid #ffe4ec', flexWrap: 'wrap' },
  filterTabs: { display: 'flex', gap: 8, flex: 1 },
  filterTab: { padding: '6px 16px', border: 'none', borderRadius: 20, cursor: 'pointer', fontSize: 14, fontWeight: 'bold' },
  dateInput: { padding: '6px 10px', border: '1px solid #ffd6e8', borderRadius: 8, fontSize: 14 },
  clearDateBtn: { padding: '6px 10px', background: '#f5f5f5', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13 },
  postList: { padding: '15px 20px' },
  emptyState: { textAlign: 'center', padding: 60, color: '#999' },
  postCard: { background: 'white', borderRadius: 16, padding: 16, marginBottom: 15, boxShadow: '0 2px 10px rgba(0,0,0,0.05)' },
  postHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  avatar: { width: 40, height: 40, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold', fontSize: 14 },
  deleteBtn: { padding: '4px 10px', background: '#fff0f0', color: '#dc3545', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12 },
  postContent: { fontSize: 15, lineHeight: 1.7, color: '#333', marginBottom: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
  postImages: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, borderRadius: 8, overflow: 'hidden' },
  postImage: { width: '100%', aspectRatio: '1', objectFit: 'cover', cursor: 'pointer' },
  fab: { position: 'fixed', bottom: 30, right: 'calc(50% - 280px)', width: 56, height: 56, borderRadius: '50%', background: 'linear-gradient(135deg, #ff69b4, #ff8fab)', color: 'white', border: 'none', boxShadow: '0 4px 15px rgba(255,105,180,0.4)', cursor: 'pointer', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  // 新建帖子页
  newPostPage: { maxWidth: 600, margin: '0 auto', minHeight: '100vh', background: 'white', display: 'flex', flexDirection: 'column' },
  newPostHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 20px', borderBottom: '1px solid #eee' },
  cancelBtn: { background: 'none', border: 'none', color: '#666', fontSize: 16, cursor: 'pointer' },
  newPostTitle: { fontWeight: 'bold', fontSize: 17, color: '#333' },
  publishBtn: { padding: '8px 20px', background: '#ff69b4', color: 'white', border: 'none', borderRadius: 20, cursor: 'pointer', fontWeight: 'bold', fontSize: 15 },
  newPostTextarea: { flex: 1, padding: '20px', border: 'none', outline: 'none', fontSize: 16, lineHeight: 1.7, resize: 'none', minHeight: 200, fontFamily: 'inherit' },
  imageGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, padding: '0 20px 20px' },
  imageWrapper: { position: 'relative', aspectRatio: '1' },
  imagePreview: { width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8 },
  removeImgBtn: { position: 'absolute', top: 4, right: 4, width: 24, height: 24, borderRadius: '50%', background: 'rgba(0,0,0,0.6)', color: 'white', border: 'none', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  addImageBtn: { aspectRatio: '1', border: '2px dashed #ddd', borderRadius: 8, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: '#fafafa' }
};

// 手机端适配：小屏幕下右下角按钮位置调整
if (typeof window !== 'undefined' && window.innerWidth <= 600) {
  styles.fab.right = 20;
}

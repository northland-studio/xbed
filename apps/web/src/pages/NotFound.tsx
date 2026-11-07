import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="container">
      <div className="state-box" style={{ minHeight: '50vh' }}>
        <div className="num" style={{ fontSize: 64, fontWeight: 800, color: '#a78bfa' }}>404</div>
        <div className="state-title">页面不存在</div>
        <div className="state-desc">你访问的页面可能已被移动或删除。请从下方入口重新开始。</div>
        <div className="row">
          <Link to="/" className="btn btn-primary">
            返回首页
          </Link>
          <Link to="/seasons" className="btn btn-outline">
            赛事中心
          </Link>
        </div>
      </div>
    </div>
  );
}

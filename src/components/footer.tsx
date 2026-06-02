import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="border-t border-border/40 bg-background/80 backdrop-blur-xl">
      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-sm text-muted-foreground">
          <div>
            <h4 className="font-semibold text-foreground mb-3">产品服务</h4>
            <div className="space-y-2">
              <Link href="/create/image" className="block hover:text-foreground transition-colors">AI生图</Link>
              <Link href="/create/video" className="block hover:text-foreground transition-colors">AI视频生成</Link>
              <Link href="/create/music" className="block hover:text-foreground transition-colors">AI音乐创作</Link>

            </div>
          </div>
          <div>
            <h4 className="font-semibold text-foreground mb-3">用户服务</h4>
            <div className="space-y-2">
              <Link href="/recharge" className="block hover:text-foreground transition-colors">充值中心</Link>
              <Link href="/membership" className="block hover:text-foreground transition-colors">会员权益</Link>
              <Link href="/my-works" className="block hover:text-foreground transition-colors">我的作品</Link>
            </div>
          </div>
          <div>
            <h4 className="font-semibold text-foreground mb-3">法律信息</h4>
            <div className="space-y-2">
              <span className="block hover:text-foreground transition-colors cursor-pointer">使用须知</span>
              <span className="block hover:text-foreground transition-colors cursor-pointer">会员充值协议</span>
              <span className="block hover:text-foreground transition-colors cursor-pointer">隐私政策</span>
            </div>
          </div>
          <div>
            <h4 className="font-semibold text-foreground mb-3">关于我们</h4>
            <div className="space-y-2">
              <span className="block hover:text-foreground transition-colors cursor-pointer">站点更新日志</span>
              <span className="block hover:text-foreground transition-colors cursor-pointer">客服联系</span>
              <span className="block hover:text-foreground transition-colors cursor-pointer">合作咨询</span>
            </div>
          </div>
        </div>
        <div className="mt-8 pt-4 border-t border-border/40 text-center text-xs text-muted-foreground">
          <p>&copy; 2025 燃冬AI. All rights reserved.</p>
          <p className="mt-1">线上经营请使用官方商户商业收款码，不建议个人收款码经营性收款</p>
        </div>
      </div>
    </footer>
  );
}

package top.suitmob.tv;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.view.InputDevice;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.webkit.WebView;

/**
 * 电视遥控器虚拟鼠标：方向键移动指针，OK 键在指针处模拟点击，
 * 指针顶到屏幕边缘时滚动指针下方的可滚动区域。
 */
public class TvCursor extends View {

    /** 点击要派发到哪个 View（网页 or 全屏视频层）。 */
    public interface TargetProvider {
        View currentTarget();
    }

    private static final long HIDE_DELAY_MS = 4000;

    private final WebView webView;
    private final TargetProvider targetProvider;
    private final float density;
    private final Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint stroke = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Path arrow = new Path();
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable hideRunnable = () -> setVisibility(INVISIBLE);

    private float x = -1, y = -1;
    private boolean enabled = true;

    public TvCursor(Context context, WebView webView, TargetProvider targetProvider) {
        super(context);
        this.webView = webView;
        this.targetProvider = targetProvider;
        this.density = context.getResources().getDisplayMetrics().density;
        setFocusable(false);
        setClickable(false);

        fill.setColor(Color.WHITE);
        fill.setStyle(Paint.Style.FILL);
        stroke.setColor(Color.BLACK);
        stroke.setStyle(Paint.Style.STROKE);
        stroke.setStrokeWidth(2 * density);
        stroke.setStrokeJoin(Paint.Join.ROUND);

        float u = density;
        arrow.moveTo(0, 0);
        arrow.lineTo(0, 22 * u);
        arrow.lineTo(6 * u, 17 * u);
        arrow.lineTo(10 * u, 26 * u);
        arrow.lineTo(14 * u, 24 * u);
        arrow.lineTo(10 * u, 15.5f * u);
        arrow.lineTo(17 * u, 15.5f * u);
        arrow.close();
    }

    public boolean isCursorEnabled() {
        return enabled;
    }

    public void setCursorEnabled(boolean on) {
        enabled = on;
        if (on) wake(); else setVisibility(INVISIBLE);
    }

    @Override
    protected void onSizeChanged(int w, int h, int oldw, int oldh) {
        if (x < 0 || x > w || y < 0 || y > h) {
            x = w / 2f;
            y = h / 2f;
        }
    }

    @Override
    protected void onDraw(Canvas canvas) {
        canvas.save();
        canvas.translate(x, y);
        canvas.drawPath(arrow, fill);
        canvas.drawPath(arrow, stroke);
        canvas.restore();
    }

    private void wake() {
        setVisibility(VISIBLE);
        handler.removeCallbacks(hideRunnable);
        handler.postDelayed(hideRunnable, HIDE_DELAY_MS);
        invalidate();
    }

    /** @return true 表示按键已被虚拟鼠标消费 */
    public boolean handleKey(KeyEvent event) {
        if (!enabled) return false;
        int code = event.getKeyCode();
        int dx = 0, dy = 0;
        switch (code) {
            case KeyEvent.KEYCODE_DPAD_LEFT: dx = -1; break;
            case KeyEvent.KEYCODE_DPAD_RIGHT: dx = 1; break;
            case KeyEvent.KEYCODE_DPAD_UP: dy = -1; break;
            case KeyEvent.KEYCODE_DPAD_DOWN: dy = 1; break;
            case KeyEvent.KEYCODE_DPAD_CENTER:
            case KeyEvent.KEYCODE_ENTER:
            case KeyEvent.KEYCODE_NUMPAD_ENTER:
                if (event.getAction() == KeyEvent.ACTION_DOWN && event.getRepeatCount() == 0) {
                    wake();
                    click();
                }
                return true;
            default:
                return false;
        }
        if (event.getAction() == KeyEvent.ACTION_DOWN) {
            // 第一次按下 8dp，长按逐渐加速到 40dp
            float step = Math.min(8 + event.getRepeatCount() * 4, 40) * density;
            move(dx * step, dy * step);
        }
        return true;
    }

    private void move(float dx, float dy) {
        wake();
        float w = getWidth(), h = getHeight();
        float nx = x + dx, ny = y + dy;
        float edge = 2 * density;
        boolean scrollX = (nx < edge && dx < 0) || (nx > w - edge && dx > 0);
        boolean scrollY = (ny < edge && dy < 0) || (ny > h - edge && dy > 0);
        x = Math.max(0, Math.min(w - 1, nx));
        y = Math.max(0, Math.min(h - 1, ny));
        if ((scrollX || scrollY) && targetProvider.currentTarget() == webView) {
            scrollPage(scrollX ? Math.signum(dx) : 0, scrollY ? Math.signum(dy) : 0);
        }
        invalidate();
    }

    /** 找到指针下方最近的可滚动元素滚动它，找不到就滚整个页面。兼容老内核，不用 el.scrollBy。 */
    private void scrollPage(float sx, float sy) {
        String js = "(function(px,py,sx,sy){"
                + "var r=window.devicePixelRatio||1,x=px/r,y=py/r;"
                + "var dx=sx*innerWidth*0.3,dy=sy*innerHeight*0.3;"
                + "var el=document.elementFromPoint(x,y);"
                + "while(el&&el!==document.body&&el!==document.documentElement){"
                + "var s=getComputedStyle(el);"
                + "var cy=dy&&el.scrollHeight>el.clientHeight&&/(auto|scroll)/.test(s.overflowY);"
                + "var cx=dx&&el.scrollWidth>el.clientWidth&&/(auto|scroll)/.test(s.overflowX);"
                + "if(cx||cy){el.scrollTop+=dy;el.scrollLeft+=dx;return;}"
                + "el=el.parentElement;}"
                + "window.scrollBy(dx,dy);"
                + "})(" + x + "," + y + "," + sx + "," + sy + ")";
        webView.evaluateJavascript(js, null);
    }

    private void click() {
        View target = targetProvider.currentTarget();
        if (target == null) return;
        int[] loc = new int[2];
        int[] self = new int[2];
        target.getLocationOnScreen(loc);
        getLocationOnScreen(self);
        float tx = x + self[0] - loc[0];
        float ty = y + self[1] - loc[1];
        long now = SystemClock.uptimeMillis();
        dispatch(target, now, now, MotionEvent.ACTION_DOWN, tx, ty);
        dispatch(target, now, now + 50, MotionEvent.ACTION_UP, tx, ty);
    }

    private static void dispatch(View target, long downTime, long time, int action, float x, float y) {
        MotionEvent ev = MotionEvent.obtain(downTime, time, action, x, y, 0);
        ev.setSource(InputDevice.SOURCE_TOUCHSCREEN);
        target.dispatchTouchEvent(ev);
        ev.recycle();
    }
}

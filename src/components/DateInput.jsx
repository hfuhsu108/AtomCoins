// 日期輸入。與原生 <input type="date"> 的唯一差別：點框內任何位置都會打開日曆。
//
// 桌面瀏覽器的原生行為是「只有點到右側那顆日曆圖示才開選擇器」，點其他地方僅取得焦點。
// 本專案有兩種用法都會踩到：① 透明覆蓋型（absolute inset-0 opacity-0，外面包 label 顯示
// 自訂文字）——圖示看不見，使用者只能沿著右邊緣亂點；② 一般型——圖示雖可見但目標很小。
// showPicker() 讓整個框都是觸發區；不支援的瀏覽器（舊 Safari）自動退回原生行為。
//
// 手機不受影響：行動瀏覽器本來點哪裡都會開。
export default function DateInput(props) {
  return (
    <input
      {...props}
      type="date"
      onClick={(e) => {
        props.onClick?.(e)
        try {
          e.currentTarget.showPicker?.()
        } catch {
          // showPicker 在非使用者手勢或不支援時會 throw，忽略即可（退回原生行為）
        }
      }}
    />
  )
}

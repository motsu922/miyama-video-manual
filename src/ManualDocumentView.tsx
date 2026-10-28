import { ArrowRight, Maximize2, PlayCircle } from 'lucide-react'
import { useMemo } from 'react'
import { getDecisionBranches } from './decisionBranches'
import { getManualDocumentRows } from './manualDocumentRows'
import { getJapaneseOriginal } from './viewerBilingual'
import type { DecisionNodeMedia, Manual, ManualTranslation, Step } from './types'
import StepVideoPlayer from './StepVideoPlayer'
import './ManualDocumentView.css'

type Props = {
  manual: Manual
  translation?: ManualTranslation
  hasVideo: boolean
  onImage: (image: { src: string; alt: string }) => void
  onPlayStep: (step: Step) => void
}

function Text({ value, original }: { value?: string; original: string }) {
  const japanese = getJapaneseOriginal(value, original)
  return <>{value || original}{japanese && <small className="viewer-japanese" lang="ja">{japanese}</small>}</>
}

export default function ManualDocumentView({ manual, translation, hasVideo, onImage, onPlayStep }: Props) {
  const rows = useMemo(() => getManualDocumentRows(manual), [manual])
  const numbers = new Map(rows.flatMap((row, index) => row.node ? [[row.node.id, index + 1] as const] : []))
  const translatedNodes = new Map(translation?.decisionNodes?.map(node => [node.id, node]))
  const translatedSteps = new Map(translation?.steps.map(step => [step.id, step]))
  const routeLink = (id: string | undefined) => {
    const number = id && numbers.get(id)
    return number ? <a href={`#document-node-${id}`}><ArrowRight size={14} aria-hidden="true" />No. {number}</a> : <span className="manual-document-missing">未接続</span>
  }
  return <article className="manual-document-view" aria-label="作業手順書">
    <header className="manual-document-heading">
      <div><p>作業手順書</p><h1><Text value={translation?.title} original={manual.title} /></h1></div>
      {manual.thumbnail && <button type="button" className="manual-document-cover" aria-label="タイトル写真を全画面表示" onClick={() => onImage({ src: manual.thumbnail, alt: manual.title })}>
        <img src={manual.thumbnail} alt="" /><Maximize2 size={16} aria-hidden="true" />
      </button>}
    </header>
    <dl className="manual-document-meta">
      <div><dt>適用部署</dt><dd><Text value={translation?.department} original={manual.department || '未設定'} /></dd></div>
      <div><dt>整理No</dt><dd>{manual.controlNo || '未設定'}</dd></div>
      <div><dt>品名</dt><dd><Text value={translation?.productName} original={manual.productName || '未設定'} /></dd></div>
      <div><dt>版数</dt><dd>{manual.version}</dd></div>
      <div><dt>更新日</dt><dd>{manual.updatedAt}</dd></div>
      <div><dt>作成者</dt><dd>{manual.owner || '未設定'}</dd></div>
    </dl>
    <table className="manual-document-table">
      <colgroup><col className="document-number-col" /><col className="document-work-col" /><col className="document-media-col" /><col className="document-check-col" /></colgroup>
      <thead><tr><th scope="col">No.</th><th scope="col">作業内容</th><th scope="col">図・写真・動画</th><th scope="col">確認ポイント・作業指示</th></tr></thead>
      <tbody>{rows.map(({ key, node, step }, index) => {
        const source = node || step!
        const translated = node ? translatedNodes.get(node.id) : translatedSteps.get(step!.id)
        const media: (DecisionNodeMedia & { category: string })[] = node ? (node.media ?? []).map(item => ({ ...item, category: '' })) : [...(step?.inspectionImages ?? []).map(item => ({ ...item, category: { ok: 'OK写真', ng: 'NG例', criteria: '判定基準' }[item.kind], kind: 'image' as const })), ...(step?.videos ?? []).map(item => ({ ...item, category: '' }))]
        return <tr key={key} id={`document-${key}`}>
          <th scope="row">{index + 1}</th>
          <td>
            {node && <div className="manual-document-kind">{node.type === 'question' ? '判断' : node.type === 'end' ? '完了' : '作業'}{node.id === (manual.decisionStartNodeId || manual.decisionNodes?.[0]?.id) ? ' / 開始' : ''}</div>}
            {!node && (manual.decisionNodes?.length ?? 0) > 0 && <div className="manual-document-kind">チャプター手順</div>}
            <div className="manual-document-text"><Text value={translated?.title} original={source.title} /></div>
            {hasVideo && step && <button type="button" className="manual-document-play" onClick={() => onPlayStep(step)}><PlayCircle size={17} aria-hidden="true" />{step.time}から動画を見る</button>}
            {node && node.type !== 'end' && <div className="manual-document-routes">
              <strong>次の作業</strong>
              {node.type === 'question' ? getDecisionBranches(node).map(branch => <div key={branch.id}>
                <span><Text value={translatedNodes.get(node.id)?.branches?.find(item => item.id === branch.id)?.label} original={branch.label || '名称未設定'} /></span>{routeLink(branch.nextNodeId)}
              </div>) : <>
                <div><span>{node.conditionalNext?.length ? '通常' : '次へ'}</span>{routeLink(node.nextNodeId)}</div>
                {node.conditionalNext?.map((route, i) => {
                  const matches = (manual.decisionNodes ?? []).filter(item => item.type === 'question').flatMap(item => getDecisionBranches(item).filter(branch => branch.id === route.branchId).map(branch => ({ node: item, branch })))
                  return <div key={`${route.branchId}-${i}`}><span>{matches.length ? matches.map(({ node: question, branch }) => <span className="manual-document-condition" key={question.id}>
                    No. {numbers.get(question.id)}: <Text value={translatedNodes.get(question.id)?.branches?.find(item => item.id === branch.id)?.label} original={branch.label} />
                  </span>) : '条件未設定'}</span>{routeLink(route.nextNodeId)}</div>
                })}
              </>}
            </div>}
          </td>
          <td><div className="manual-document-media">{media.length ? media.map(item => <figure key={item.id}>
            {item.kind === 'video' ? <StepVideoPlayer media={item} /> : <button type="button" aria-label={`${item.name}を全画面表示`} onClick={() => onImage({ src: item.url, alt: item.name })}>
              <img src={item.url} alt={item.name} loading="lazy" /><Maximize2 size={18} aria-hidden="true" />
            </button>}
            <figcaption>{item.category && <strong>{item.category} </strong>}{item.name}</figcaption>
          </figure>) : <span className="manual-document-empty">資料なし</span>}</div></td>
          <td><div className="manual-document-text"><Text value={translated?.detail} original={source.detail || ''} /></div></td>
        </tr>
      })}</tbody>
    </table>
    {!rows.length && <p className="manual-document-empty">手順はまだ登録されていません。</p>}
    {(manual.manualImages?.length ?? 0) > 0 && <section className="manual-document-attachments"><h2>共通資料</h2><div className="manual-document-media">{manual.manualImages?.map(item => <figure key={item.id}>
      <button type="button" aria-label={`${item.name}を全画面表示`} onClick={() => onImage({ src: item.url, alt: item.name })}><img src={item.url} alt={item.name} loading="lazy" /><Maximize2 size={18} aria-hidden="true" /></button><figcaption>{item.name}</figcaption>
    </figure>)}</div></section>}
  </article>
}

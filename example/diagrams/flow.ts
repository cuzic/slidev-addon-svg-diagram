import {diagram, caption, box, row, connect} from 'svg-diagram';

export default function define() {
  const d = diagram({theme: 'blue', title: '図の埋め込み', gap: 32});
  d.add(caption('ソースから SVG を作り、スライドへ埋め込む', {bold: true}));
  d.add(row([
    box({id: 'src', title: 'diagram.ts', body: 'svg-diagram のソース'}),
    box({id: 'svg', title: 'SVG', body: 'ビルド時に生成'}),
    box({id: 'slide', title: 'スライド', body: '<SvgDiagram>'}),
  ], {gap: 48}));
  d.add(connect('src:right', 'svg:left'), connect('svg:right', 'slide:left'));
  return d;
}

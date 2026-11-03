<script setup lang="ts">
type Sentiment = '极度利好' | '偏利好' | '中性' | '偏利空' | '极度利空'

interface RelatedStock {
  code: string
  name: string
}

interface NewsItem {
  id: string
  title: string
  content: string
  publish_time: string
  source: string
  sentiment: Sentiment
  impact_score: number
  adjusted_impact?: number
  related_sectors: string[]
  related_stocks: RelatedStock[]
  ai_comment: string
  verified?: boolean
}

defineProps<{ items: NewsItem[] }>()
const emit = defineEmits<{ sectorSelected: [sector: string] }>()

const tone = (item: NewsItem) => {
  const impact = item.adjusted_impact ?? item.impact_score
  return impact > 5 ? 'positive' : impact < -5 ? 'negative' : 'neutral'
}

const timeText = (value: string) => new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
}).format(new Date(value))
</script>

<template>
  <section class="today-catalysts" aria-labelledby="catalyst-title">
    <header>
      <div>
        <small>NEWS CATALYSTS</small>
        <h2 id="catalyst-title">今日重磅催化</h2>
      </div>
      <span>来源权重 × 时间衰减</span>
    </header>

    <div class="catalyst-list">
      <article v-for="item in items" :key="item.id" class="catalyst-row">
        <span class="sentiment" :class="tone(item)">{{ item.sentiment }}</span>
        <div class="copy">
          <h3>{{ item.title }}</h3>
          <p>{{ item.source }} · {{ timeText(item.publish_time) }}</p>
          <div class="sectors">
            <button
              v-for="sector in item.related_sectors"
              :key="sector"
              type="button"
              @click="emit('sectorSelected', sector)"
            >
              {{ sector }}
            </button>
          </div>
        </div>
        <b>{{ (item.adjusted_impact ?? item.impact_score).toFixed(1) }}</b>
      </article>
      <p v-if="!items.length" class="empty">暂无达到时效阈值的资讯</p>
    </div>

    <footer>资讯由AI抓取分析，不构成投资建议，请注意风险。</footer>
  </section>
</template>

<style scoped>
.today-catalysts { padding: 20px; border: 1px solid #ded8ca; border-radius: 14px; background: #fffdf7; }
header { display: flex; align-items: end; justify-content: space-between; gap: 16px; }
header small, header > span, .copy p, footer { color: #817b70; font-size: 12px; }
h2, h3, p { margin: 0; }
h2 { margin-top: 3px; font-size: 21px; }
.catalyst-list { max-height: 330px; margin-top: 12px; overflow: auto; }
.catalyst-row { display: grid; grid-template-columns: 72px 1fr 58px; gap: 12px; align-items: center; padding: 12px 0; border-top: 1px solid #ebe6db; }
.sentiment { padding: 5px 8px; border-radius: 999px; text-align: center; font-size: 12px; font-weight: 700; }
.positive { color: #b53c32; background: #f9e5e1; }
.negative { color: #14715b; background: #def1eb; }
.neutral { color: #6e6a61; background: #ece9e2; }
.copy { min-width: 0; }
.copy h3 { overflow: hidden; font-size: 14px; text-overflow: ellipsis; white-space: nowrap; }
.copy p { margin-top: 5px; }
.sectors { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 7px; }
.sectors button { padding: 3px 8px; border: 1px solid #ded8ca; border-radius: 999px; background: transparent; cursor: pointer; }
.catalyst-row > b { color: #9b6a25; text-align: right; }
footer { margin-top: 10px; }
.empty { padding: 24px; color: #817b70; text-align: center; }
</style>

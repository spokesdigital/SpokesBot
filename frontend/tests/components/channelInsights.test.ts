import { splitInsightsBySection } from '@/components/dashboard/channelInsights'

describe('channelInsights', () => {
  it('maps the 4 backend insights to the 4 channel dashboard sections', () => {
    const insights = [
      { type: 'trend', text: 'Traffic insight' },
      { type: 'success', text: 'Conversion insight' },
      { type: 'success', text: 'Revenue insight' },
      { type: 'trend', text: 'Distribution insight' },
    ]

    expect(splitInsightsBySection(insights)).toEqual({
      traffic: [{ type: 'trend', text: 'Traffic insight' }],
      conversion: [{ type: 'success', text: 'Conversion insight' }],
      revenue: [{ type: 'success', text: 'Revenue insight' }],
      distribution: [{ type: 'trend', text: 'Distribution insight' }],
    })
  })

  it('leaves later sections empty when the backend returns fewer than 4 insights', () => {
    expect(
      splitInsightsBySection([
        { type: 'trend', text: 'Traffic insight' },
        { type: 'success', text: 'Conversion insight' },
      ]),
    ).toEqual({
      traffic: [{ type: 'trend', text: 'Traffic insight' }],
      conversion: [{ type: 'success', text: 'Conversion insight' }],
      revenue: [],
      distribution: [],
    })
  })
})

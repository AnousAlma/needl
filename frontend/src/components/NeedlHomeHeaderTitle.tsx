import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { needlLogoMarkXmlForBackground } from '../branding/needlLogoMarkXml';

const LOGO_SIZE = 30;

export function NeedlHomeHeaderTitle({
  textColor,
  markBackgroundColor,
}: {
  textColor: string;
  markBackgroundColor: string;
}) {
  const xml = useMemo(() => needlLogoMarkXmlForBackground(markBackgroundColor), [markBackgroundColor]);

  return (
    <View style={styles.row} accessibilityRole="header">
      <View style={styles.logoWrap}>
        <SvgXml xml={xml} width={LOGO_SIZE} height={LOGO_SIZE} />
      </View>
      <Text style={[styles.title, { color: textColor }]}>Needl</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logoWrap: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
  },
});

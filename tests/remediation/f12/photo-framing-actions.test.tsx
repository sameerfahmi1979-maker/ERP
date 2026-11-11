// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
const crop = vi.hoisted(() => ({ props: {} as { zoom: number; rotation: number } }));
vi.mock('react-easy-crop', () => ({ default: (props: typeof crop.props) => { crop.props = props; return <div />; } }));
import PhotoFramingEditor from '@/features/hr/employees/photo-framing-editor';
afterEach(cleanup);

it('icon framing controls retain zoom limits, rotation and reset', () => {
  render(<PhotoFramingEditor url="blob:synthetic" source={{documentId:1,versionId:2,fileId:3,sha256:"a".repeat(64),width:400,height:600}} initial={null} onApply={vi.fn()} onCancel={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', {name:'Zoom in'}));
  expect(crop.props.zoom).toBeCloseTo(1.1);
  fireEvent.click(screen.getByRole('button', {name:'Zoom out'}));
  fireEvent.click(screen.getByRole('button', {name:'Zoom out'}));
  expect(crop.props.zoom).toBe(1);
  fireEvent.click(screen.getByRole('button', {name:'Rotate 90°'}));
  expect(crop.props.rotation).toBe(90);
  fireEvent.click(screen.getByRole('button', {name:'Reset'}));
  expect(crop.props.rotation).toBe(0);
  expect(crop.props.zoom).toBe(1);
});

it('keeps explicit framing confirmation and cancellation', () => {
  const apply = vi.fn(), cancel = vi.fn();
  render(<PhotoFramingEditor url="blob:synthetic" source={{documentId:1,versionId:2,fileId:3,sha256:"a".repeat(64),width:400,height:600}} initial={null} onApply={apply} onCancel={cancel} />);
  fireEvent.click(screen.getByRole('button', {name:'Use this framing'}));
  expect(apply).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', {name:'Cancel'}));
  expect(cancel).toHaveBeenCalledTimes(1);
});

// Vocabulário ÚNICO de ícones do app (Lucide). O mesmo conceito tem o mesmo ícone em qualquer página.
// Ícone novo: adicione aqui (nome semântico → componente Lucide). Emoji NUNCA é ícone de UI:
// só vale como conteúdo escolhido pelo usuário (ex.: o ícone de uma lista).

import {
  Activity, AlertTriangle, ArrowLeft, ArrowRight, AtSign, Award, Banknote, Bell, BookOpen, Brain, Calendar, CalendarDays, ChevronDown,
  ChevronLeft, ChevronRight, ChevronUp, Check, CheckCircle2, Clapperboard, Clock, Command, Copy, Download, Dumbbell, Ellipsis, Eye, EyeOff,
  FlaskConical, Film, Filter, Flag, Flame, Footprints, Grid2x2, Hash, Heart, HeartPulse, House, Inbox, Info, Keyboard, Layers, LayoutGrid,
  Leaf, Library, Link, List, ListChecks, Mail, MapPin, Medal, Menu, MessageSquare, Minus, Monitor, Moon, Palette, Pencil, Plane, Play, Plus,
  RefreshCw, Repeat, Route, Search, SlidersHorizontal, Smartphone, Sparkles, Star, Sun, Sunrise, Tag, Target, Timer, Trash2, TrendingDown,
  TrendingUp, Trophy, Tv, Undo2, Upload, User, Users, Wallet, X, Zap, BarChart3, ArrowUpDown, type LucideIcon,
} from 'lucide-react'

export const ICONS = {
  // ações
  add: Plus, close: X, check: Check, edit: Pencil, delete: Trash2, undo: Undo2, copy: Copy, refresh: RefreshCw, download: Download, upload: Upload,
  search: Search, filter: Filter, sort: ArrowUpDown, group: Layers, more: Ellipsis, play: Play, link: Link, eye: Eye, 'eye-off': EyeOff,
  // navegação
  home: House, back: ArrowLeft, forward: ArrowRight, left: ChevronLeft, right: ChevronRight, up: ChevronUp, down: ChevronDown, menu: Menu,
  apps: LayoutGrid, grid: Grid2x2, list: List, command: Command, keyboard: Keyboard,
  // sistema
  sun: Sun, moon: Moon, prefs: SlidersHorizontal, palette: Palette, phone: Smartphone, desktop: Monitor, bell: Bell, info: Info,
  warning: AlertTriangle, success: CheckCircle2, sparkles: Sparkles, minus: Minus,
  // tempo
  calendar: Calendar, days: CalendarDays, clock: Clock, timer: Timer, sunrise: Sunrise,
  // dados
  stats: BarChart3, 'trend-up': TrendingUp, 'trend-down': TrendingDown, trophy: Trophy, medal: Medal, award: Award, activity: Activity,
  // conceitos do domínio (um ícone por conceito, em todo o app)
  task: ListChecks, habit: Repeat, goal: Target, experiment: FlaskConical, focus: Timer, inbox: Inbox,
  book: BookOpen, movie: Film, anime: Clapperboard, series: Tv, person: User, people: Users, trip: Plane, money: Wallet, bank: Banknote,
  journal: MessageSquare, knowledge: Brain, library: Library, mail: Mail, tag: Tag, place: MapPin, mention: AtSign, hash: Hash, flag: Flag,
  // treino (agente de exemplo da página /design)
  workout: Dumbbell, run: Route, hiit: Flame, mobility: Leaf, steps: Footprints, heart: Heart, pulse: HeartPulse, energy: Zap, star: Star,
} as const satisfies Record<string, LucideIcon>

export type IconName = keyof typeof ICONS

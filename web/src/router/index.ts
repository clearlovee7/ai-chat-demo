import { createRouter, createWebHistory } from "vue-router";
import Chat from "@/views/Chat.vue";

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: "/",
      name: "home",
      component: Chat,
    },
    {
      path: '/knowledge',
      name: 'knowledge',
      component: () => import('@/views/Knowledge.vue')
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/'
    }
  ],
});

export default router;
